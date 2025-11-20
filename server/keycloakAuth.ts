import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage.js";
import { db } from "./db.js";
import { organizations, organizationMembers, projects, projectMembers } from "../shared/schema.js";
import { eq, and } from "drizzle-orm";
import { createDefaultProjectColumns } from "./projectHelpers.js";

const getKeycloakConfig = memoize(
  async () => {
    const keycloakUrl = process.env.KEYCLOAK_URL;
    const realm = process.env.KEYCLOAK_REALM;
    const clientId = process.env.KEYCLOAK_CLIENT_ID;
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
    
    if (!keycloakUrl || !realm || !clientId || !clientSecret) {
      throw new Error("KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, and KEYCLOAK_CLIENT_SECRET must be set");
    }

    const issuerUrl = `${keycloakUrl}/realms/${realm}`;
    const config = await client.discovery(
      new URL(issuerUrl),
      clientId,
      clientSecret
    );
    
    return config;
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: 'auto', // Auto-detect HTTPS
      sameSite: 'lax',
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  try {
    console.log("[upsertUser] Upserting user with claims:", {
      sub: claims["sub"],
      email: claims["email"],
      given_name: claims["given_name"],
      family_name: claims["family_name"],
    });
    
    const result = await storage.upsertUser({
      id: claims["sub"],
      email: claims["email"],
      firstName: claims["given_name"] || claims["name"]?.split(" ")[0] || "",
      lastName: claims["family_name"] || claims["name"]?.split(" ").slice(1).join(" ") || "",
      profileImageUrl: claims["picture"],
    });
    
    console.log("[upsertUser] User upserted successfully:", result.email);

    // Check if user is member of any organization
    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, result.id))
      .limit(1);

    if (!membership) {
      console.log("[upsertUser] User not in any organization, creating personal organization...");
      
      // Create personal organization for this user
      const userDisplayName = result.firstName && result.lastName 
        ? `${result.firstName} ${result.lastName}`
        : result.firstName || result.email?.split('@')[0] || 'Usuario';
      
      const orgName = `Organización de ${userDisplayName}`;
      
      const [userOrg] = await db
        .insert(organizations)
        .values({
          name: orgName,
          description: "Organización personal",
          ownerId: result.id,
        })
        .returning();
      
      console.log("[upsertUser] Created personal organization:", userOrg.id);

      // Add user to organization as owner
      await db.insert(organizationMembers).values({
        organizationId: userOrg.id,
        userId: result.id,
        role: 'owner',
      });

      console.log("[upsertUser] Added user to organization as owner:", userOrg.id);
      
      const defaultOrg = userOrg;

      // Get or create default project
      const DEFAULT_PROJECT_NAME = "Proyecto General";
      let [defaultProject] = await db
        .select()
        .from(projects)
        .where(and(
          eq(projects.name, DEFAULT_PROJECT_NAME),
          eq(projects.organizationId, defaultOrg.id)
        ))
        .limit(1);

      if (!defaultProject) {
        // Create default project if it doesn't exist
        [defaultProject] = await db
          .insert(projects)
          .values({
            name: DEFAULT_PROJECT_NAME,
            description: "Proyecto por defecto",
            organizationId: defaultOrg.id,
            createdById: result.id,
          })
          .returning();
        
        console.log("[upsertUser] Created default project:", defaultProject.id);
        
        // Create default columns for the project
        await createDefaultProjectColumns(defaultProject.id);
      }

      // Add user to project
      await db.insert(projectMembers).values({
        projectId: defaultProject.id,
        userId: result.id,
        role: 'member',
      });

      console.log("[upsertUser] Added user to project:", defaultProject.id);
    }
  } catch (error) {
    console.error("[upsertUser] Failed to upsert user:", error);
    throw error;
  }
}

export async function setupAuth(app: Express) {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }
  
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getKeycloakConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    try {
      console.log("[Keycloak Auth] Verify function called");
      const user = {};
      updateUserSession(user, tokens);
      console.log("[Keycloak Auth] Session updated");
      await upsertUser(tokens.claims());
      console.log("[Keycloak Auth] User upserted, calling verified callback");
      verified(null, user);
    } catch (error) {
      console.error("[Keycloak Auth] Error in verify function:", error);
      verified(error as Error);
    }
  };

  const STRATEGY_NAME = "keycloak";

  const registeredStrategies = new Set<string>();

  const buildCallbackURL = (req: any) => {
    const protocol = req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}/api/callback`;
  };

  const ensureStrategy = (req: any) => {
    const callbackURL = buildCallbackURL(req);
    const strategyName = `${STRATEGY_NAME}:${req.get('host')}`;
    
    if (!registeredStrategies.has(strategyName)) {
      console.log(`[Keycloak Auth] Registering new strategy for host: ${req.get('host')}, callback URL: ${callbackURL}`);
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile",
          callbackURL,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
    return strategyName;
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    const strategyName = ensureStrategy(req);
    const callbackURL = buildCallbackURL(req);
    console.log(`[Keycloak Auth] Login initiated. Strategy: ${strategyName}, Callback URL: ${callbackURL}`);
    console.log(`[Keycloak Auth] Request details - Protocol: ${req.protocol}, Host: ${req.get('host')}, Hostname: ${req.hostname}`);
    passport.authenticate(strategyName)(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    console.log(`[Keycloak Auth] Callback endpoint hit. Query params:`, Object.keys(req.query));
    const strategyName = ensureStrategy(req);
    console.log(`[Keycloak Auth] Callback received. Strategy: ${strategyName}`);
    passport.authenticate(strategyName, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", async (req, res) => {
    const protocol = req.protocol;
    const host = req.get('host');
    const config = await getKeycloakConfig();
    
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.KEYCLOAK_CLIENT_ID!,
          post_logout_redirect_uri: `${protocol}://${host}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getKeycloakConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
