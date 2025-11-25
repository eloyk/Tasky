import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { setupAuth, isAuthenticated } from "./keycloakAuth.js";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage.js";
import { ObjectPermission, getObjectAclPolicy, setObjectAclPolicy } from "./objectAcl.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { 
  insertTaskSchema, 
  insertCommentSchema, 
  insertAttachmentSchema,
  insertTaskRelationshipSchema,
  insertOrganizationSchema,
  insertProjectSchema,
  insertOrganizationMemberSchema,
  insertProjectMemberSchema,
  insertBoardColumnSchema,
  insertBoardSchema,
  users,
  organizations,
  projects,
  tasks,
  taskRelationships,
  organizationMembers,
  projectMembers,
  boardColumns,
  boards,
  teams,
  teamMembers,
  boardTeams,
  projectTeams,
  OrganizationRole,
  ProjectRole
} from "../shared/schema.js";
import { db } from "./db.js";
import { eq, and, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { createDefaultBoardColumns } from "./projectHelpers.js";
import type { Task, Board, Project } from "../shared/schema.js";
import { keycloakAdmin } from "./keycloakAdmin.js";

/**
 * Obtiene el rol de un usuario en una organización.
 * PRIORIDAD: Keycloak (fuente de verdad) > BD local (fallback temporal)
 */
async function getUserOrganizationRole(
  keycloakUserId: string,
  organizationId: string
): Promise<'owner' | 'admin' | 'member' | null> {
  try {
    console.log(`[getUserOrganizationRole] Checking role for Keycloak user ${keycloakUserId} in org ${organizationId}`);
    
    // Intentar obtener rol desde Keycloak (fuente de verdad)
    const kcRole = await keycloakAdmin.getUserRoleInOrganization(keycloakUserId, organizationId);
    
    console.log(`[getUserOrganizationRole] Keycloak role result:`, kcRole);
    
    if (kcRole) {
      return kcRole;
    }
    
    // Fallback: Consultar BD local si Keycloak no tiene el rol
    // IMPORTANTE: Primero necesitamos encontrar al usuario en BD local por su email
    console.warn(`[getUserOrganizationRole] Rol no encontrado en Keycloak para user ${keycloakUserId} en org ${organizationId}, buscando en BD local`);
    
    // Obtener información del usuario desde Keycloak
    const keycloakUser = await keycloakAdmin.getUserById(keycloakUserId);
    if (!keycloakUser || !keycloakUser.email) {
      console.warn(`[getUserOrganizationRole] No se pudo obtener información del usuario desde Keycloak`);
      return null;
    }
    
    // Buscar usuario en BD local por email
    const [localUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, keycloakUser.email))
      .limit(1);
    
    if (!localUser) {
      console.warn(`[getUserOrganizationRole] Usuario no encontrado en BD local con email ${keycloakUser.email}`);
      return null;
    }
    
    // Ahora buscar membresía usando el ID de BD local
    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, localUser.id),
          eq(organizationMembers.organizationId, organizationId)
        )
      )
      .limit(1);
    
    const role = membership?.role?.toLowerCase() as 'owner' | 'admin' | 'member' || null;
    console.log(`[getUserOrganizationRole] Local DB role result:`, role);
    
    return role;
  } catch (error) {
    console.error('[getUserOrganizationRole] Error al obtener rol:', error);
    return null;
  }
}

// Helper function to get task with assignee information
async function getTaskWithAssignee(taskId: string) {
  const result = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      boardId: tasks.boardId,
      columnId: tasks.columnId,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      projectId: tasks.projectId,
      assigneeId: tasks.assigneeId,
      createdById: tasks.createdById,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      assignee: {
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      },
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

// Helper function to verify user has access to a task
async function verifyTaskAccess(taskId: string, userId: string): Promise<{ task: any | null; allowed: boolean }> {
  const task = await getTaskWithAssignee(taskId);
  
  if (!task) {
    return { task: null, allowed: false };
  }
  
  // Get task's project
  const projectResult = await db.select().from(projects).where(eq(projects.id, task.projectId)).limit(1);
  
  if (projectResult.length === 0) {
    return { task, allowed: false };
  }
  
  const project = projectResult[0];
  
  // Check if user is member of project's organization
  const membership = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, project.organizationId)
      )
    )
    .limit(1);
  
  return {
    task,
    allowed: membership.length > 0
  };
}

// Helper function to verify user has access to a board
// keycloakUserId: ID de Keycloak (UUID) para verificar rol en Keycloak
// localUserId: ID local de la base de datos para verificar membresías en tablas locales
async function verifyBoardAccess(boardId: string, keycloakUserId: string, localUserId: string): Promise<{ board: Board | null; allowed: boolean }> {
  const boardResult = await db.select().from(boards).where(eq(boards.id, boardId)).limit(1);
  
  if (boardResult.length === 0) {
    return { board: null, allowed: false };
  }
  
  const board = boardResult[0];
  
  // Get board's project
  const projectResult = await db.select().from(projects).where(eq(projects.id, board.projectId)).limit(1);
  
  if (projectResult.length === 0) {
    return { board, allowed: false };
  }
  
  const project = projectResult[0];
  
  // CRITICAL: Obtener rol del usuario desde Keycloak (fuente de verdad)
  const userRole = await getUserOrganizationRole(keycloakUserId, project.organizationId);
  
  // User MUST be organization member - this is required for tenant isolation
  if (!userRole) {
    return {
      board,
      allowed: false
    };
  }
  
  // Admins and Owners have universal access (role-based override)
  if (userRole === 'admin' || userRole === 'owner') {
    return {
      board,
      allowed: true
    };
  }
  
  // Check if board has team-based restrictions
  const boardTeamsAssigned = await db
    .select()
    .from(boardTeams)
    .where(eq(boardTeams.boardId, boardId))
    .limit(1);
  
  // If board has NO team restrictions, all org members have access (default behavior)
  if (boardTeamsAssigned.length === 0) {
    return {
      board,
      allowed: true
    };
  }
  
  // Board HAS team restrictions - verify regular member is in an assigned team
  // Use localUserId for team membership queries (local DB tables)
  const teamAccess = await db
    .select()
    .from(teamMembers)
    .innerJoin(boardTeams, eq(teamMembers.teamId, boardTeams.teamId))
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(
      and(
        eq(teamMembers.userId, localUserId),
        eq(boardTeams.boardId, boardId),
        // CRITICAL: Ensure team belongs to same organization (defense in depth)
        eq(teams.organizationId, project.organizationId)
      )
    )
    .limit(1);
  
  return {
    board,
    allowed: teamAccess.length > 0
  };
}

// Helper function to verify user has access to a project
// keycloakUserId: ID de Keycloak (UUID) para verificar rol en Keycloak
// localUserId: ID local de la base de datos para verificar membresías en tablas locales
async function verifyProjectAccess(projectId: string, keycloakUserId: string, localUserId: string): Promise<{ project: Project | null; allowed: boolean }> {
  const projectResult = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  
  if (projectResult.length === 0) {
    return { project: null, allowed: false };
  }
  
  const project = projectResult[0];
  
  // CRITICAL: Obtener rol del usuario desde Keycloak (fuente de verdad)
  const userRole = await getUserOrganizationRole(keycloakUserId, project.organizationId);
  
  // User MUST be organization member - this is required for tenant isolation
  if (!userRole) {
    return {
      project,
      allowed: false
    };
  }
  
  // Admins and Owners have universal access (role-based override)
  if (userRole === 'admin' || userRole === 'owner') {
    return {
      project,
      allowed: true
    };
  }
  
  // Check if project has team-based restrictions
  const projectTeamsAssigned = await db
    .select()
    .from(projectTeams)
    .where(eq(projectTeams.projectId, projectId))
    .limit(1);
  
  // If project has NO team restrictions, all org members have access (default behavior)
  if (projectTeamsAssigned.length === 0) {
    return {
      project,
      allowed: true
    };
  }
  
  // Project HAS team restrictions - verify regular member is in an assigned team
  // Use localUserId for team membership queries (local DB tables)
  const teamAccess = await db
    .select()
    .from(teamMembers)
    .innerJoin(projectTeams, eq(teamMembers.teamId, projectTeams.teamId))
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(
      and(
        eq(teamMembers.userId, localUserId),
        eq(projectTeams.projectId, projectId),
        // CRITICAL: Ensure team belongs to same organization (defense in depth)
        eq(teams.organizationId, project.organizationId)
      )
    )
    .limit(1);
  
  return {
    project,
    allowed: teamAccess.length > 0
  };
}

// Configuración de multer para almacenamiento local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../uploads');

const profileImageStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dest = path.join(uploadsDir, 'profile-images');
    try {
      await fs.mkdir(dest, { recursive: true });
      cb(null, dest);
    } catch (error) {
      cb(error as Error, dest);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `profile-${uniqueSuffix}${ext}`);
  }
});

const attachmentStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dest = path.join(uploadsDir, 'attachments');
    try {
      await fs.mkdir(dest, { recursive: true });
      cb(null, dest);
    } catch (error) {
      cb(error as Error, dest);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniqueSuffix}-${safeName}`);
  }
});

const uploadProfileImage = multer({
  storage: profileImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const uploadAttachment = multer({
  storage: attachmentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);
  
  // Servir archivos estáticos desde el directorio uploads
  app.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
  });
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

  app.get('/api/auth/debug', isAuthenticated, async (req: any, res) => {
    try {
      console.log("[DEBUG] req.user:", JSON.stringify(req.user, null, 2));
      console.log("[DEBUG] req.isAuthenticated():", req.isAuthenticated());
      res.json({
        isAuthenticated: req.isAuthenticated(),
        user: req.user,
        claims: req.user?.claims,
      });
    } catch (error) {
      console.error("[DEBUG] Error:", error);
      res.status(500).json({ message: "Debug failed", error: String(error) });
    }
  });

  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      console.log("[/api/auth/user] Starting, req.user exists:", !!req.user);
      console.log("[/api/auth/user] req.user.claims:", req.user?.claims);
      
      const userEmail = req.user?.claims?.email;
      if (!userEmail) {
        console.error("[/api/auth/user] No email found in req.user");
        console.error("[/api/auth/user] Full req.user:", JSON.stringify(req.user, null, 2));
        return res.status(401).json({ message: "No user email in session" });
      }
      
      console.log("[/api/auth/user] Looking for user with email:", userEmail);
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      if (!user) {
        console.error(`[/api/auth/user] User not found in database: ${userEmail}`);
        console.error("[/api/auth/user] Attempting to create user from Keycloak claims...");
        
        // Try to create the user from Keycloak claims
        try {
          const claims = req.user.claims;
          const newUser = await storage.upsertUser({
            id: claims.sub,
            email: claims.email,
            firstName: claims.given_name || claims.name?.split(" ")[0] || "",
            lastName: claims.family_name || claims.name?.split(" ").slice(1).join(" ") || "",
            profileImageUrl: claims.picture,
          });
          console.log("[/api/auth/user] User created:", newUser.email);
          
          // Get ALL user's organization memberships for multi-org support (new user case)
          const newUserMemberships = await db
            .select({
              organizationId: organizationMembers.organizationId,
              role: organizationMembers.role,
            })
            .from(organizationMembers)
            .where(eq(organizationMembers.userId, newUser.id));
          
          // Get organization details for new user
          const newUserOrgIds = newUserMemberships.map(m => m.organizationId);
          let newUserOrgsWithDetails: Array<{
            organizationId: string;
            organizationName: string;
            role: string;
          }> = [];
          
          if (newUserOrgIds.length > 0) {
            const newUserOrgs = await db
              .select()
              .from(organizations)
              .where(inArray(organizations.id, newUserOrgIds));
            
            newUserOrgsWithDetails = newUserMemberships.map(m => {
              const org = newUserOrgs.find(o => o.id === m.organizationId);
              return {
                organizationId: m.organizationId,
                organizationName: org?.name || 'Unknown',
                role: m.role,
              };
            });
          }
          
          const newUserPrimaryMembership = newUserMemberships[0];
          
          return res.json({
            ...newUser,
            organizationId: newUserPrimaryMembership?.organizationId || null,
            role: newUserPrimaryMembership?.role || null,
            organizations: newUserOrgsWithDetails,
          });
        } catch (createError) {
          console.error("[/api/auth/user] Failed to create user:", createError);
          return res.status(500).json({ message: "Failed to create user" });
        }
      }
      
      // Get ALL user's organization memberships for multi-org support
      const memberships = await db
        .select({
          organizationId: organizationMembers.organizationId,
          role: organizationMembers.role,
        })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, user.id));
      
      // Also get organization details for each membership
      const orgIds = memberships.map(m => m.organizationId);
      let organizationsWithDetails: Array<{
        organizationId: string;
        organizationName: string;
        role: string;
      }> = [];
      
      if (orgIds.length > 0) {
        const orgs = await db
          .select()
          .from(organizations)
          .where(inArray(organizations.id, orgIds));
        
        organizationsWithDetails = memberships.map(m => {
          const org = orgs.find(o => o.id === m.organizationId);
          return {
            organizationId: m.organizationId,
            organizationName: org?.name || 'Unknown',
            role: m.role,
          };
        });
      }
      
      // Primary organization for backward compatibility (first one)
      const primaryMembership = memberships[0];
      
      console.log("[/api/auth/user] Returning user:", user.email, "orgs:", organizationsWithDetails.length);
      res.json({
        ...user,
        organizationId: primaryMembership?.organizationId || null,
        role: primaryMembership?.role || null,
        organizations: organizationsWithDetails,
      });
    } catch (error) {
      console.error("[/api/auth/user] Error:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/tasks", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // CRITICAL: Get user's organizations to enforce tenant isolation
      const userOrgs = await db
        .select()
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, user.id));
      
      if (userOrgs.length === 0) {
        return res.json([]); // No organizations = no tasks
      }
      
      const orgIds = userOrgs.map(o => o.organizationId);
      
      // Get projects from user's organizations
      const userProjects = await db
        .select()
        .from(projects)
        .where(inArray(projects.organizationId, orgIds));
      
      if (userProjects.length === 0) {
        return res.json([]);
      }
      
      const projectIds = userProjects.map(p => p.id);
      
      // CRITICAL: Only return tasks from user's projects (tenant-isolated)
      // Include assignee information with left join
      const userTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          boardId: tasks.boardId,
          columnId: tasks.columnId,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
          projectId: tasks.projectId,
          assigneeId: tasks.assigneeId,
          createdById: tasks.createdById,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          assignee: {
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl,
          },
        })
        .from(tasks)
        .leftJoin(users, eq(tasks.assigneeId, users.id))
        .where(inArray(tasks.projectId, projectIds));
      
      res.json(userTasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/tasks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const { task, allowed } = await verifyTaskAccess(id, user.id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(task);
    } catch (error) {
      console.error("Error fetching task:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/tasks", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const validated = insertTaskSchema.safeParse(req.body);
      
      if (!validated.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: validated.error.errors,
        });
      }
      
      // CRITICAL: Verify user has access to the project
      const project = await db.select().from(projects).where(eq(projects.id, validated.data.projectId)).limit(1);
      
      if (project.length === 0) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const membership = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, user.id),
            eq(organizationMembers.organizationId, project[0].organizationId)
          )
        )
        .limit(1);
      
      if (membership.length === 0) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const task = await storage.createTask({
        ...validated.data,
        createdById: user.id,
      });
      
      console.log('[DEBUG] Tarea creada:', {
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        columnId: task.columnId
      });
      
      // Log task creation
      await storage.createActivityLog({
        taskId: task.id,
        userId: user.id,
        actionType: "created",
        fieldName: "task",
        newValue: task.title,
      });

      res.json(task);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/tasks/:id/column", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { columnId } = req.body;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // CRITICAL: Verify user has access to the task
      const { task: verifiedTask, allowed } = await verifyTaskAccess(id, user.id);
      
      if (!verifiedTask) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      if (!columnId) {
        return res.status(400).json({ message: "Column ID is required" });
      }

      // Get old task state before updating
      const oldTask = await storage.getTask(id);
      if (!oldTask) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Verify that the target column belongs to the same board as the task
      const [targetColumn] = await db
        .select()
        .from(boardColumns)
        .where(eq(boardColumns.id, columnId));

      if (!targetColumn) {
        return res.status(404).json({ message: "Column not found" });
      }

      // Verify column belongs to the same board as the task
      if (targetColumn.boardId !== oldTask.boardId) {
        return res.status(400).json({ message: "Column does not belong to task's board" });
      }

      const task = await storage.updateTaskColumn(id, columnId);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Log column change
      if (oldTask && oldTask.columnId !== columnId) {
        await storage.createActivityLog({
          taskId: id,
          userId: user.id,
          actionType: "column_change",
          fieldName: "column",
          oldValue: oldTask.columnId,
          newValue: columnId,
        });
      }

      res.json(task);
    } catch (error) {
      console.error("Error updating task column:", error);
      res.status(500).json({ message: "Failed to update task column" });
    }
  });

  app.delete("/api/tasks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const { task, allowed } = await verifyTaskAccess(id, user.id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      await storage.deleteTask(id);
      res.json({ message: "Task deleted successfully" });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Organization routes
  app.get("/api/organizations", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // CRITICAL: Solo usuarios con permiso organization-creators pueden acceder a esta página
      const canCreate = await keycloakAdmin.canCreateOrganizations(keycloakUserId);
      
      if (!canCreate) {
        return res.status(403).json({ 
          message: "No tienes permiso para acceder a esta sección. Solo administradores del sistema pueden gestionar organizaciones." 
        });
      }

      // Get organizations where user is a member
      const userOrgs = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          description: organizations.description,
          ownerId: organizations.ownerId,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
          role: organizationMembers.role,
        })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
        .where(eq(organizationMembers.userId, user.id));

      res.json(userOrgs);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

  app.post("/api/organizations", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub; // ID de Keycloak (el correcto)
      
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        console.error("[API] User not found for email:", userEmail);
        return res.status(401).json({ message: "User not found" });
      }

      console.log("[API] Creating organization for user. DB ID:", user.id, "Keycloak ID:", keycloakUserId);

      // CRITICAL: Verificar que el usuario tenga permiso para crear organizaciones
      // Usar el ID de Keycloak, no el de la BD local
      const canCreate = await keycloakAdmin.canCreateOrganizations(keycloakUserId);
      console.log("[API] User can create organizations:", canCreate);
      
      if (!canCreate) {
        console.error("[API] User", keycloakUserId, "does not have permission to create organizations");
        return res.status(403).json({ 
          message: "No tienes permiso para crear organizaciones. Contacta al administrador del sistema." 
        });
      }

      const validatedData = insertOrganizationSchema.parse({
        ...req.body,
        ownerId: user.id,
      });

      console.log("[API] Validated data:", validatedData);

      const [organization] = await db.insert(organizations).values(validatedData).returning();
      console.log("[API] Organization created in DB:", organization.id);

      // Crear grupo y roles en Keycloak para la organización
      try {
        await keycloakAdmin.createOrganizationGroup(organization.id, organization.name);
        // Usar el ID de Keycloak para asignar el rol
        await keycloakAdmin.assignUserToOrganizationRole(keycloakUserId, organization.id, 'owner');
        console.log("[API] Roles de Keycloak creados y asignados para organización:", organization.id);
      } catch (kcError) {
        console.error("[API] Error al crear roles en Keycloak:", kcError);
        // Continuar - la organización se creó en BD pero sin roles en Keycloak
      }

      // Add owner as member with owner role (mantener en BD local por compatibilidad)
      await db.insert(organizationMembers).values({
        organizationId: organization.id,
        userId: user.id,
        role: OrganizationRole.OWNER,
      });

      console.log("[API] Organization member added, returning success");
      res.json(organization);
    } catch (error) {
      console.error("[API] Error creating organization - Full error:", error);
      console.error("[API] Error stack:", error instanceof Error ? error.stack : 'No stack');
      console.error("[API] Error message:", error instanceof Error ? error.message : String(error));
      res.status(400).json({ 
        message: "Failed to create organization",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Endpoint para verificar si el usuario actual puede crear organizaciones
  app.get("/api/auth/can-create-organizations", isAuthenticated, async (req: any, res) => {
    try {
      const keycloakUserId = req.user.claims.sub;
      const canCreate = await keycloakAdmin.canCreateOrganizations(keycloakUserId);
      res.json({ canCreate });
    } catch (error) {
      console.error("[API] Error checking organization creation permission:", error);
      res.json({ canCreate: false });
    }
  });

  // List all users from Keycloak (for adding members to organizations)
  app.get("/api/keycloak/users", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if user can create organizations
      const canCreateOrgs = await keycloakAdmin.canCreateOrganizations(keycloakUserId);

      // If not an organization-creator, check if user is owner/admin of at least one org
      let isOrgAdminOrOwner = false;
      if (!canCreateOrgs) {
        // Use Keycloak directly to check user's roles in organizations (more efficient)
        const hasAdminRole = await keycloakAdmin.isAdminOfAnyOrganization(keycloakUserId);
        isOrgAdminOrOwner = hasAdminRole;
      }

      if (!isOrgAdminOrOwner && !canCreateOrgs) {
        return res.status(403).json({ 
          message: "No tienes permiso para ver la lista de usuarios" 
        });
      }

      const keycloakUsers = await keycloakAdmin.listAllUsers();
      res.json(keycloakUsers);
    } catch (error) {
      console.error("[API] Error listing Keycloak users:", error);
      res.status(500).json({ message: "Failed to list users" });
    }
  });

  // Endpoint administrativo: Otorgar permiso de creación de organizaciones
  app.post("/api/admin/grant-org-creator/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const userEmail = req.user.claims.email;
      const [requestingUser] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!requestingUser) {
        return res.status(401).json({ message: "User not found" });
      }

      // CRITICAL: Solo usuarios con permiso de crear organizaciones pueden otorgar este permiso
      const canGrantPermission = await keycloakAdmin.canCreateOrganizations(requestingUser.id);
      if (!canGrantPermission) {
        return res.status(403).json({ 
          message: "No tienes permiso para otorgar permisos de creación de organizaciones." 
        });
      }

      // Verificar que el usuario objetivo existe
      const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
      if (!targetUser) {
        return res.status(404).json({ message: "Usuario objetivo no encontrado" });
      }

      // Otorgar permiso en Keycloak
      await keycloakAdmin.grantOrganizationCreatorPermission(userId);

      res.json({ 
        message: `Permiso de creación de organizaciones otorgado a ${targetUser.email}`,
        userId: targetUser.id,
        email: targetUser.email
      });
    } catch (error) {
      console.error("Error granting org creator permission:", error);
      res.status(500).json({ message: "Failed to grant permission" });
    }
  });

  app.get("/api/organizations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if user is a member
      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, id),
          eq(organizationMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }

      const [organization] = await db.select().from(organizations).where(eq(organizations.id, id));

      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      res.json(organization);
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  app.get("/api/organizations/:id/projects", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if user is a member of the organization
      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, id),
          eq(organizationMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }

      const orgProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.organizationId, id));

      res.json(orgProjects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  // Get organization members from Keycloak (source of truth)
  app.get("/api/organizations/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if user has access to this organization (using Keycloak as source of truth)
      const userRole = await getUserOrganizationRole(keycloakUserId, id);
      
      if (!userRole) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }

      // Get members from Keycloak (source of truth)
      const keycloakMembers = await keycloakAdmin.getOrganizationMembers(id);

      // Transform to match expected frontend format
      const members = keycloakMembers.map(member => ({
        userId: member.userId,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        username: member.username,
        role: member.role,
      }));

      res.json(members);
    } catch (error) {
      console.error("Error fetching organization members:", error);
      res.status(500).json({ message: "Failed to fetch organization members" });
    }
  });

  // Add member to organization (using Keycloak as source of truth)
  app.post("/api/organizations/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { keycloakUserId, role } = req.body;
      const userEmail = req.user.claims.email;
      const requestingKeycloakId = req.user.claims.sub;
      
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if requester is admin or owner (using Keycloak as source of truth)
      const requesterRole = await getUserOrganizationRole(requestingKeycloakId, id);
      
      if (!requesterRole || (requesterRole !== 'owner' && requesterRole !== 'admin')) {
        return res.status(403).json({ message: "No tienes autorización para agregar miembros" });
      }

      // Verify the user exists in Keycloak
      const keycloakUser = await keycloakAdmin.getUserById(keycloakUserId);
      
      if (!keycloakUser) {
        return res.status(404).json({ message: "Usuario no encontrado en Keycloak" });
      }

      // Normalize role to lowercase
      const normalizedRole = (role || 'member').toLowerCase() as 'owner' | 'admin' | 'member';

      // Assign user to organization in Keycloak (source of truth)
      await keycloakAdmin.assignUserToOrganizationRole(keycloakUserId, id, normalizedRole);

      // Also sync to local database for compatibility
      // Find or create user in local DB
      let [localUser] = await db.select().from(users).where(eq(users.email, keycloakUser.email));
      
      if (!localUser) {
        // Create user in local DB if doesn't exist
        [localUser] = await db.insert(users).values({
          email: keycloakUser.email,
          firstName: keycloakUser.firstName || null,
          lastName: keycloakUser.lastName || null,
        }).returning();
      }

      // Check if membership already exists in local DB
      const [existingMembership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, id),
          eq(organizationMembers.userId, localUser.id)
        ));

      if (existingMembership) {
        // Update existing membership
        await db
          .update(organizationMembers)
          .set({ role: normalizedRole })
          .where(and(
            eq(organizationMembers.organizationId, id),
            eq(organizationMembers.userId, localUser.id)
          ));
      } else {
        // Create new membership
        await db.insert(organizationMembers).values({
          organizationId: id,
          userId: localUser.id,
          role: normalizedRole,
        });
      }

      res.json({ 
        userId: keycloakUserId,
        email: keycloakUser.email,
        firstName: keycloakUser.firstName,
        lastName: keycloakUser.lastName,
        role: normalizedRole 
      });
    } catch (error) {
      console.error("Error adding organization member:", error);
      res.status(400).json({ 
        message: "No se pudo agregar el miembro",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Remove member from organization (using Keycloak as source of truth)
  app.delete("/api/organizations/:id/members/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const { id, userId } = req.params;
      const userEmail = req.user.claims.email;
      const requestingKeycloakId = req.user.claims.sub;
      
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if requester is admin or owner (using Keycloak as source of truth)
      const requesterRole = await getUserOrganizationRole(requestingKeycloakId, id);
      
      if (!requesterRole || (requesterRole !== 'owner' && requesterRole !== 'admin')) {
        return res.status(403).json({ message: "No tienes autorización para remover miembros" });
      }

      // Cannot remove owners
      const targetUserRole = await getUserOrganizationRole(userId, id);
      if (targetUserRole === 'owner') {
        return res.status(403).json({ message: "No se puede remover al propietario de la organización" });
      }

      // Remove from Keycloak (source of truth)
      await keycloakAdmin.removeUserFromOrganization(userId, id);

      // Also remove from local database for compatibility
      const keycloakUser = await keycloakAdmin.getUserById(userId);
      if (keycloakUser) {
        const [localUser] = await db.select().from(users).where(eq(users.email, keycloakUser.email));
        if (localUser) {
          await db
            .delete(organizationMembers)
            .where(and(
              eq(organizationMembers.organizationId, id),
              eq(organizationMembers.userId, localUser.id)
            ));
        }
      }

      res.json({ message: "Miembro removido exitosamente" });
    } catch (error) {
      console.error("Error removing organization member:", error);
      res.status(400).json({ 
        message: "No se pudo remover el miembro",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.patch("/api/organizations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if requester is admin or owner
      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, id),
          eq(organizationMembers.userId, user.id)
        ));

      if (!membership || (membership.role !== OrganizationRole.OWNER && membership.role !== OrganizationRole.ADMIN)) {
        return res.status(403).json({ message: "Not authorized to update this organization" });
      }

      const { name, description } = req.body;
      const [updated] = await db
        .update(organizations)
        .set({ name, description, updatedAt: new Date() })
        .where(eq(organizations.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating organization:", error);
      res.status(400).json({ message: "Failed to update organization" });
    }
  });

  app.delete("/api/organizations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if requester is owner
      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, id),
          eq(organizationMembers.userId, user.id)
        ));

      if (!membership || membership.role !== OrganizationRole.OWNER) {
        return res.status(403).json({ message: "Only the owner can delete this organization" });
      }

      // Delete the organization (cascade will handle related records)
      await db.delete(organizations).where(eq(organizations.id, id));

      res.json({ message: "Organization deleted successfully" });
    } catch (error) {
      console.error("Error deleting organization:", error);
      res.status(400).json({ message: "Failed to delete organization" });
    }
  });

  // Project routes
  app.get("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      console.log("[GET /api/projects] User email:", userEmail);
      
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        console.log("[GET /api/projects] User not found in database");
        return res.status(401).json({ message: "User not found" });
      }

      console.log("[GET /api/projects] User found:", user.id, user.email);

      // Get ALL user's organization memberships
      const memberships = await db
        .select()
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, user.id));

      if (memberships.length === 0) {
        console.log("[GET /api/projects] No membership found for user");
        return res.json([]);
      }

      console.log("[GET /api/projects] Found", memberships.length, "organization memberships");

      // Define type for project results
      type ProjectResult = {
        id: string;
        name: string;
        description: string | null;
        organizationId: string;
        createdById: string;
        createdAt: Date | null;
        updatedAt: Date | null;
      };

      // Get org IDs where user is owner or admin
      const adminOrgIds = memberships
        .filter(m => m.role === OrganizationRole.OWNER || m.role === OrganizationRole.ADMIN)
        .map(m => m.organizationId);

      // Get user's team memberships for filtering
      const userTeamMemberships = await db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(eq(teamMembers.userId, user.id));
      const userTeamIds = userTeamMemberships.map(tm => tm.teamId);

      // Get org IDs where user is only a member (not admin/owner)
      const memberOnlyOrgIds = memberships
        .filter(m => m.role === OrganizationRole.MEMBER)
        .map(m => m.organizationId);

      // Collect all accessible projects
      const allAccessibleProjects: ProjectResult[] = [];

      // 1. Get ALL projects from orgs where user is admin/owner (no team filtering)
      if (adminOrgIds.length > 0) {
        console.log("[GET /api/projects] User is owner/admin in", adminOrgIds.length, "orgs");
        const adminProjects = await db
          .select({
            id: projects.id,
            name: projects.name,
            description: projects.description,
            organizationId: projects.organizationId,
            createdById: projects.createdById,
            createdAt: projects.createdAt,
            updatedAt: projects.updatedAt,
          })
          .from(projects)
          .where(inArray(projects.organizationId, adminOrgIds));
        
        allAccessibleProjects.push(...adminProjects);
      }

      // 2. Get projects from orgs where user is only a member (with team filtering)
      if (memberOnlyOrgIds.length > 0) {
        console.log("[GET /api/projects] User is member in", memberOnlyOrgIds.length, "orgs");
        const memberOrgProjects = await db
          .select({
            id: projects.id,
            name: projects.name,
            description: projects.description,
            organizationId: projects.organizationId,
            createdById: projects.createdById,
            createdAt: projects.createdAt,
            updatedAt: projects.updatedAt,
          })
          .from(projects)
          .where(inArray(projects.organizationId, memberOnlyOrgIds));

        // Filter projects based on team assignments
        const filteredProjects = await Promise.all(
          memberOrgProjects.map(async (project) => {
            // Check if project has any team assignments
            const projectTeamAssignments = await db
              .select({ teamId: projectTeams.teamId })
              .from(projectTeams)
              .where(eq(projectTeams.projectId, project.id));

            // If no teams assigned, all org members have access
            if (projectTeamAssignments.length === 0) {
              return project;
            }

            // If teams are assigned, check if user is member of any assigned team
            const assignedTeamIds = projectTeamAssignments.map(pt => pt.teamId);
            const hasAccess = userTeamIds.some(teamId => assignedTeamIds.includes(teamId));
            
            return hasAccess ? project : null;
          })
        );

        const accessibleMemberProjects = filteredProjects.filter((project): project is ProjectResult => project !== null);
        allAccessibleProjects.push(...accessibleMemberProjects);
      }

      console.log("[GET /api/projects] Found", allAccessibleProjects.length, "projects");

      // Add team count for each project
      const projectsWithCounts = await Promise.all(
        allAccessibleProjects.map(async (project: ProjectResult) => {
          const teamCount = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(projectTeams)
            .where(eq(projectTeams.projectId, project.id));
          
          return {
            ...project,
            teamCount: teamCount[0]?.count || 0,
          };
        })
      );

      console.log("[GET /api/projects] Returning", projectsWithCounts.length, "projects with counts");
      res.json(projectsWithCounts);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.post("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if user is member of organization
      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, req.body.organizationId),
          eq(organizationMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }

      const validatedData = insertProjectSchema.parse(req.body);

      const [project] = await db.insert(projects).values({
        ...validatedData,
        createdById: user.id,
      }).returning();

      // Add creator as admin member
      await db.insert(projectMembers).values({
        projectId: project.id,
        userId: user.id,
        role: 'admin',
      });

      res.json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(400).json({ message: "Failed to create project" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if user is a member
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, id),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this project" });
      }

      const [project] = await db.select().from(projects).where(eq(projects.id, id));

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post("/api/boards/:id/columns", isAuthenticated, async (req: any, res) => {
    try {
      const { id: boardId } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Verify board exists and get its project
      const [board] = await db.select().from(boards).where(eq(boards.id, boardId));
      if (!board) {
        return res.status(404).json({ message: "Board not found" });
      }

      // Check if user is a member of the board's project
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, board.projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this project" });
      }

      // Get max order to place new column at the end
      const maxOrder = await db
        .select({ maxOrder: sql<number>`COALESCE(MAX(${boardColumns.order}), -1)` })
        .from(boardColumns)
        .where(eq(boardColumns.boardId, boardId));

      // Validate input with Zod schema using safeParse
      const validation = insertBoardColumnSchema.safeParse({
        name: req.body.name,
        boardId: boardId,
        order: (maxOrder[0]?.maxOrder ?? -1) + 1,
      });

      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid column data", 
          errors: validation.error.errors 
        });
      }

      const [newColumn] = await db.insert(boardColumns).values(validation.data).returning();

      res.json(newColumn);
    } catch (error) {
      console.error("Error creating board column:", error);
      res.status(500).json({ message: "Failed to create column" });
    }
  });

  app.patch("/api/boards/:id/columns/reorder", isAuthenticated, async (req: any, res) => {
    try {
      const { id: boardId } = req.params;
      console.log("[REORDER] Request received for board:", boardId);
      console.log("[REORDER] Request body:", JSON.stringify(req.body, null, 2));
      
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        console.error("[REORDER] User not found:", userEmail);
        return res.status(401).json({ message: "User not found" });
      }

      // Verify board exists and get its project
      const [board] = await db.select().from(boards).where(eq(boards.id, boardId));
      if (!board) {
        console.error("[REORDER] Board not found:", boardId);
        return res.status(404).json({ message: "Board not found" });
      }

      // Check if user is a member of the board's project
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, board.projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership) {
        console.error("[REORDER] User not a member:", user.id, board.projectId);
        return res.status(403).json({ message: "Not a member of this project" });
      }

      // Validate columns array using safeParse
      const columnsSchema = z.array(z.object({
        id: z.string(),
        order: z.number().int().min(0)
      })).min(1, "At least one column is required");
      
      const validation = columnsSchema.safeParse(req.body.columns);
      
      if (!validation.success) {
        console.error("[REORDER] Validation failed:", validation.error.errors);
        return res.status(400).json({ 
          message: "Invalid column data", 
          errors: validation.error.errors 
        });
      }

      console.log("[REORDER] Updating columns:", validation.data);

      // Use a transaction to update all orders atomically
      await db.transaction(async (tx) => {
        // First, set all orders to negative values to avoid unique constraint violations
        for (const column of validation.data) {
          await tx
            .update(boardColumns)
            .set({ order: -1 - column.order }) // Use negative temporary values
            .where(and(
              eq(boardColumns.id, column.id),
              eq(boardColumns.boardId, boardId)
            ));
        }

        // Then, update to the final positive order values
        for (const column of validation.data) {
          await tx
            .update(boardColumns)
            .set({ order: column.order })
            .where(and(
              eq(boardColumns.id, column.id),
              eq(boardColumns.boardId, boardId)
            ));
        }
      });

      // Return updated columns
      const updatedColumns = await db
        .select()
        .from(boardColumns)
        .where(eq(boardColumns.boardId, boardId))
        .orderBy(boardColumns.order);

      console.log("[REORDER] Success! Updated columns:", updatedColumns.length);
      res.json(updatedColumns);
    } catch (error) {
      console.error("[REORDER] Error reordering board columns:", error);
      console.error("[REORDER] Error stack:", (error as Error).stack);
      res.status(500).json({ message: "Failed to reorder columns" });
    }
  });

  app.patch("/api/boards/:id/columns/:columnId", isAuthenticated, async (req: any, res) => {
    try {
      const { id: boardId, columnId } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Verify column exists first
      const [existingColumn] = await db
        .select()
        .from(boardColumns)
        .where(eq(boardColumns.id, columnId));

      if (!existingColumn) {
        return res.status(404).json({ message: "Column not found" });
      }

      // Verify column belongs to the board
      if (existingColumn.boardId !== boardId) {
        return res.status(404).json({ message: "Column does not belong to this board" });
      }

      // Verify board exists and get its project
      const [board] = await db.select().from(boards).where(eq(boards.id, boardId));
      if (!board) {
        return res.status(404).json({ message: "Board not found" });
      }

      // Check if user is a member of the board's project
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, board.projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this project" });
      }

      // Validate name using safeParse
      const nameSchema = z.string().min(1, "Column name cannot be empty");
      const validation = nameSchema.safeParse(req.body.name);

      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid column name", 
          errors: validation.error.errors 
        });
      }

      const [updated] = await db
        .update(boardColumns)
        .set({ name: validation.data })
        .where(eq(boardColumns.id, columnId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating board column:", error);
      res.status(500).json({ message: "Failed to update column" });
    }
  });

  app.delete("/api/boards/:id/columns/:columnId", isAuthenticated, async (req: any, res) => {
    try {
      const { id: boardId, columnId } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Verify column exists first
      const [columnToDelete] = await db
        .select()
        .from(boardColumns)
        .where(eq(boardColumns.id, columnId));

      if (!columnToDelete) {
        return res.status(404).json({ message: "Column not found" });
      }

      // Verify column belongs to the board
      if (columnToDelete.boardId !== boardId) {
        return res.status(404).json({ message: "Column does not belong to this board" });
      }

      // Verify board exists and get its project
      const [board] = await db.select().from(boards).where(eq(boards.id, boardId));
      if (!board) {
        return res.status(404).json({ message: "Board not found" });
      }

      // Check if user is a member of the board's project
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, board.projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this project" });
      }

      // Check if column has tasks (prevent deletion if it does)
      const tasksInColumn = await db
        .select()
        .from(tasks)
        .where(eq(tasks.columnId, columnId))
        .limit(1);

      if (tasksInColumn.length > 0) {
        return res.status(400).json({ message: "Cannot delete column with existing tasks. Move or delete tasks first." });
      }

      await db
        .delete(boardColumns)
        .where(eq(boardColumns.id, columnId));

      res.json({ message: "Column deleted successfully" });
    } catch (error) {
      console.error("Error deleting board column:", error);
      res.status(500).json({ message: "Failed to delete column" });
    }
  });

  app.get("/api/projects/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if user is a member
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, id),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this project" });
      }

      const members = await db
        .select({
          id: projectMembers.id,
          userId: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          role: projectMembers.role,
          createdAt: projectMembers.createdAt,
        })
        .from(projectMembers)
        .innerJoin(users, eq(projectMembers.userId, users.id))
        .where(eq(projectMembers.projectId, id));

      res.json(members);
    } catch (error) {
      console.error("Error fetching project members:", error);
      res.status(500).json({ message: "Failed to fetch project members" });
    }
  });

  app.post("/api/projects/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { userEmail: memberEmail, role } = req.body;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if requester is admin
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, id),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership || membership.role !== 'admin') {
        return res.status(403).json({ message: "Not authorized to add members" });
      }

      // Find member by email
      const [memberUser] = await db.select().from(users).where(eq(users.email, memberEmail));
      
      if (!memberUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const validatedData = insertProjectMemberSchema.parse({
        projectId: id,
        userId: memberUser.id,
        role: role || 'member',
      });

      const [member] = await db.insert(projectMembers).values(validatedData).returning();

      res.json(member);
    } catch (error) {
      console.error("Error adding project member:", error);
      res.status(400).json({ message: "Failed to add member" });
    }
  });

  app.patch("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if requester is admin
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, id),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership || membership.role !== 'admin') {
        return res.status(403).json({ message: "Not authorized to update this project" });
      }

      const { name, description } = req.body;
      const [updated] = await db
        .update(projects)
        .set({ name, description, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(400).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if requester is admin
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, id),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership || membership.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can delete this project" });
      }

      // Delete the project (cascade will handle related records)
      await db.delete(projects).where(eq(projects.id, id));

      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(400).json({ message: "Failed to delete project" });
    }
  });

  app.get("/api/tasks/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // CRITICAL: Verify task access
      const { task, allowed } = await verifyTaskAccess(id, user.id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const comments = await storage.getTaskComments(id);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/tasks/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // CRITICAL: Verify task access
      const { task, allowed } = await verifyTaskAccess(id, user.id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const validatedData = insertCommentSchema.parse({
        taskId: id,
        userId: user.id,
        content: req.body.content,
      });

      const comment = await storage.createComment(validatedData);
      res.json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(400).json({ message: "Failed to create comment" });
    }
  });

  app.get("/api/tasks/:id/attachments", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // CRITICAL: Verify task access
      const { task, allowed } = await verifyTaskAccess(id, user.id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const attachments = await storage.getTaskAttachments(id);
      res.json(attachments);
    } catch (error) {
      console.error("Error fetching attachments:", error);
      res.status(500).json({ message: "Failed to fetch attachments" });
    }
  });

  app.get("/api/tasks/:id/activity", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // CRITICAL: Verify task access
      const { task, allowed } = await verifyTaskAccess(id, user.id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const activity = await storage.getTaskActivity(id);
      res.json(activity);
    } catch (error) {
      console.error("Error fetching activity:", error);
      res.status(500).json({ message: "Failed to fetch activity" });
    }
  });

  // Get task relationships
  app.get("/api/tasks/:id/relationships", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // CRITICAL: Verify task access
      const { task, allowed } = await verifyTaskAccess(id, user.id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get relationships where this task is the source or target
      const relationships = await db
        .select({
          id: taskRelationships.id,
          taskId: taskRelationships.taskId,
          relatedTaskId: taskRelationships.relatedTaskId,
          relationshipType: taskRelationships.relationshipType,
          createdById: taskRelationships.createdById,
          createdAt: taskRelationships.createdAt,
          relatedTask: {
            id: tasks.id,
            title: tasks.title,
            priority: tasks.priority,
            columnId: tasks.columnId,
          },
        })
        .from(taskRelationships)
        .leftJoin(tasks, eq(taskRelationships.relatedTaskId, tasks.id))
        .where(eq(taskRelationships.taskId, id));
      
      res.json(relationships);
    } catch (error) {
      console.error("Error fetching task relationships:", error);
      res.status(500).json({ message: "Failed to fetch task relationships" });
    }
  });

  // Create task relationship
  app.post("/api/tasks/:id/relationships", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // CRITICAL: Verify task access
      const { task, allowed } = await verifyTaskAccess(id, user.id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { relatedTaskId, relationshipType = "related" } = req.body;
      
      if (!relatedTaskId) {
        return res.status(400).json({ message: "Related task ID is required" });
      }
      
      // Verify the related task exists and user has access
      const { task: relatedTask, allowed: relatedAllowed } = await verifyTaskAccess(relatedTaskId, user.id);
      
      if (!relatedTask) {
        return res.status(404).json({ message: "Related task not found" });
      }
      
      if (!relatedAllowed) {
        return res.status(403).json({ message: "Access denied to related task" });
      }
      
      // Create the relationship
      const [relationship] = await db
        .insert(taskRelationships)
        .values({
          taskId: id,
          relatedTaskId,
          relationshipType,
          createdById: user.id,
        })
        .returning();
      
      res.status(201).json(relationship);
    } catch (error) {
      console.error("Error creating task relationship:", error);
      res.status(500).json({ message: "Failed to create task relationship" });
    }
  });

  // Delete task relationship
  app.delete("/api/task-relationships/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // Get the relationship to verify access
      const [relationship] = await db
        .select()
        .from(taskRelationships)
        .where(eq(taskRelationships.id, id));
      
      if (!relationship) {
        return res.status(404).json({ message: "Relationship not found" });
      }
      
      // Verify user has access to the task
      const { allowed } = await verifyTaskAccess(relationship.taskId, user.id);
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Delete the relationship
      await db.delete(taskRelationships).where(eq(taskRelationships.id, id));
      
      res.json({ message: "Relationship deleted successfully" });
    } catch (error) {
      console.error("Error deleting task relationship:", error);
      res.status(500).json({ message: "Failed to delete task relationship" });
    }
  });

  app.post("/api/tasks/:id/attachments", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // CRITICAL: Verify task access
      const { task, allowed } = await verifyTaskAccess(id, user.id);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.normalizeObjectEntityPath(req.body.objectPath);

      // Verify the object exists and set ownership if not set
      try {
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
        
        // Check if ACL is already set
        const existingAcl = await getObjectAclPolicy(objectFile);
        
        if (!existingAcl) {
          // Set ACL for newly uploaded file - owner is the current user
          await setObjectAclPolicy(objectFile, {
            owner: user.id,
            visibility: "private",
          });
        } else {
          // Verify the user has write permission to this object
          const canAccess = await objectStorageService.canAccessObjectEntity({
            objectFile,
            userId: user.id,
            requestedPermission: ObjectPermission.WRITE,
          });
          
          if (!canAccess) {
            return res.status(403).json({ message: "No tienes permiso para adjuntar este archivo" });
          }
        }
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          return res.status(404).json({ message: "El archivo no existe" });
        }
        throw error;
      }

      const validatedData = insertAttachmentSchema.parse({
        taskId: id,
        userId: user.id,
        fileName: req.body.fileName,
        objectPath: objectPath,
        fileSize: req.body.fileSize,
        mimeType: req.body.mimeType,
      });

      const attachment = await storage.createAttachment(validatedData);
      res.json(attachment);
    } catch (error) {
      console.error("Error creating attachment:", error);
      res.status(400).json({ message: "Failed to create attachment" });
    }
  });

  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL, objectPath });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ message: "Failed to get upload URL" });
    }
  });

  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Board endpoints
  app.get("/api/boards", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get ALL user's organization memberships
      const memberships = await db
        .select()
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, user.id));

      if (memberships.length === 0) {
        return res.json([]);
      }

      // Define type for board results
      type BoardResult = {
        id: string;
        name: string;
        description: string | null;
        projectId: string;
        createdById: string;
        createdAt: Date | null;
        updatedAt: Date | null;
        projectName: string;
        organizationId: string;
      };

      // Get org IDs where user is owner or admin
      const adminOrgIds = memberships
        .filter(m => m.role === OrganizationRole.OWNER || m.role === OrganizationRole.ADMIN)
        .map(m => m.organizationId);

      // Get user's team memberships for filtering
      const userTeamMemberships = await db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(eq(teamMembers.userId, user.id));
      const userTeamIds = userTeamMemberships.map(tm => tm.teamId);

      // Get org IDs where user is only a member (not admin/owner)
      const memberOnlyOrgIds = memberships
        .filter(m => m.role === OrganizationRole.MEMBER)
        .map(m => m.organizationId);

      // Collect all accessible boards
      const allAccessibleBoards: BoardResult[] = [];

      // 1. Get ALL boards from orgs where user is admin/owner (no team filtering)
      if (adminOrgIds.length > 0) {
        const adminBoards = await db
          .select({
            id: boards.id,
            name: boards.name,
            description: boards.description,
            projectId: boards.projectId,
            createdById: boards.createdById,
            createdAt: boards.createdAt,
            updatedAt: boards.updatedAt,
            projectName: projects.name,
            organizationId: projects.organizationId,
          })
          .from(boards)
          .innerJoin(projects, eq(projects.id, boards.projectId))
          .where(inArray(projects.organizationId, adminOrgIds));
        
        allAccessibleBoards.push(...adminBoards);
      }

      // 2. Get boards from orgs where user is only a member (with team filtering)
      if (memberOnlyOrgIds.length > 0) {
        const memberOrgBoards = await db
          .select({
            id: boards.id,
            name: boards.name,
            description: boards.description,
            projectId: boards.projectId,
            createdById: boards.createdById,
            createdAt: boards.createdAt,
            updatedAt: boards.updatedAt,
            projectName: projects.name,
            organizationId: projects.organizationId,
          })
          .from(boards)
          .innerJoin(projects, eq(projects.id, boards.projectId))
          .where(inArray(projects.organizationId, memberOnlyOrgIds));

        // Filter boards based on team assignments
        const filteredBoards = await Promise.all(
          memberOrgBoards.map(async (board) => {
            // Check if board has any team assignments
            const boardTeamAssignments = await db
              .select({ teamId: boardTeams.teamId })
              .from(boardTeams)
              .where(eq(boardTeams.boardId, board.id));

            // If no teams assigned, all org members have access
            if (boardTeamAssignments.length === 0) {
              return board;
            }

            // If teams are assigned, check if user is member of any assigned team
            const assignedTeamIds = boardTeamAssignments.map(bt => bt.teamId);
            const hasAccess = userTeamIds.some(teamId => assignedTeamIds.includes(teamId));
            
            return hasAccess ? board : null;
          })
        );

        const accessibleMemberBoards = filteredBoards.filter((board): board is BoardResult => board !== null);
        allAccessibleBoards.push(...accessibleMemberBoards);
      }

      // Add team count for each board and format with project info
      const boardsWithCounts = await Promise.all(
        allAccessibleBoards.map(async (board: BoardResult) => {
          const teamCount = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(boardTeams)
            .where(eq(boardTeams.boardId, board.id));
          
          return {
            id: board.id,
            name: board.name,
            description: board.description,
            projectId: board.projectId,
            createdById: board.createdById,
            createdAt: board.createdAt,
            updatedAt: board.updatedAt,
            project: {
              id: board.projectId,
              name: board.projectName,
            },
            teamCount: teamCount[0]?.count || 0,
          };
        })
      );

      res.json(boardsWithCounts);
    } catch (error) {
      console.error("Error fetching boards:", error);
      res.status(500).json({ message: "Failed to fetch boards" });
    }
  });

  app.get("/api/projects/:id/boards", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if user is a member of the project
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, id),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "You are not a member of this project" });
      }

      const projectBoards = await storage.getBoardsByProject(id);
      res.json(projectBoards);
    } catch (error) {
      console.error("Error fetching boards:", error);
      res.status(500).json({ message: "Failed to fetch boards" });
    }
  });

  app.post("/api/boards", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const validatedData = insertBoardSchema.parse(req.body);

      // Check if user is a member of the project
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, validatedData.projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "You are not a member of this project" });
      }

      const board = await storage.createBoard({
        ...validatedData,
        createdById: user.id,
      });

      // Create default columns for the new board
      await createDefaultBoardColumns(board.id);

      res.json(board);
    } catch (error) {
      console.error("Error creating board:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid board data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create board" });
    }
  });

  app.patch("/api/boards/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // CRITICAL: Verify user has access to the board
      const { board, allowed } = await verifyBoardAccess(id, keycloakUserId, user.id);
      
      if (!board) {
        return res.status(404).json({ message: "Board not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updateData = insertBoardSchema.partial().parse(req.body);
      const updatedBoard = await storage.updateBoard(id, updateData);

      if (!updatedBoard) {
        return res.status(404).json({ message: "Board not found" });
      }

      res.json(updatedBoard);
    } catch (error) {
      console.error("Error updating board:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid board data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update board" });
    }
  });

  app.get("/api/boards/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // CRITICAL: Verify user has access to the board
      const { board, allowed } = await verifyBoardAccess(id, keycloakUserId, user.id);
      
      if (!board) {
        return res.status(404).json({ message: "Board not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(board);
    } catch (error) {
      console.error("Error fetching board:", error);
      res.status(500).json({ message: "Failed to fetch board" });
    }
  });

  app.get("/api/boards/:id/columns", isAuthenticated, async (req: any, res) => {
    try {
      const { id: boardId } = req.params;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // CRITICAL: Verify user has access to the board
      const { board, allowed } = await verifyBoardAccess(boardId, keycloakUserId, user.id);
      
      if (!board) {
        return res.status(404).json({ message: "Board not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get columns for this board
      const columns = await db
        .select()
        .from(boardColumns)
        .where(eq(boardColumns.boardId, boardId))
        .orderBy(boardColumns.order);

      res.json(columns);
    } catch (error) {
      console.error("Error fetching board columns:", error);
      res.status(500).json({ message: "Failed to fetch board columns" });
    }
  });

  app.get("/api/boards/:id/tasks", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // CRITICAL: Verify user has access to the board
      const { board, allowed } = await verifyBoardAccess(id, keycloakUserId, user.id);
      
      if (!board) {
        return res.status(404).json({ message: "Board not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get tasks for this board
      const tasks = await storage.getTasksByBoard(id);
      console.log('[DEBUG] Tareas obtenidas para board:', {
        boardId: id,
        projectId: board.projectId,
        count: tasks.length,
        taskIds: tasks.map(t => t.id)
      });
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching board tasks:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/boards/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // CRITICAL: Verify user has access to the board
      const { board, allowed } = await verifyBoardAccess(id, keycloakUserId, user.id);
      
      if (!board) {
        return res.status(404).json({ message: "Board not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Additional check: User must be admin of the project to delete
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, board.projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership || membership.role !== 'admin') {
        return res.status(403).json({ message: "Only project admins can delete boards" });
      }

      const success = await storage.deleteBoard(id);
      if (!success) {
        return res.status(404).json({ message: "Board not found" });
      }

      res.json({ message: "Board deleted successfully" });
    } catch (error) {
      console.error("Error deleting board:", error);
      res.status(500).json({ message: "Failed to delete board" });
    }
  });

  // ========================================
  // USER PROFILE ROUTES
  // ========================================

  // Get profile image upload URL
  // Upload profile image (local storage)
  app.post("/api/user/profile-image/upload", isAuthenticated, uploadProfileImage.single('image'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Construir URL pública del archivo
      const imageUrl = `/uploads/profile-images/${req.file.filename}`;
      
      res.json({ imageUrl });
    } catch (error) {
      console.error("Error uploading profile image:", error);
      res.status(500).json({ message: "Failed to upload image" });
    }
  });

  // Update user profile (photo, name, etc.)
  app.put("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const updateData = req.body;
      const allowedFields = ['firstName', 'lastName', 'profileImageUrl'];
      const filteredData = Object.keys(updateData)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = updateData[key];
          return obj;
        }, {} as any);

      const updatedUser = await storage.updateUserProfile(user.id, filteredData);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Get users with board access (for task assignment)
  app.get("/api/boards/:boardId/users", isAuthenticated, async (req: any, res) => {
    try {
      const { boardId } = req.params;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { allowed } = await verifyBoardAccess(boardId, keycloakUserId, user.id);
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      const usersWithAccess = await storage.getUsersWithBoardAccess(boardId);
      res.json(usersWithAccess);
    } catch (error) {
      console.error("Error fetching board users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // ========================================
  // TEAMS ROUTES (Admin Only)
  // ========================================

  // Get all teams in organization
  app.get("/api/organizations/:organizationId/teams", isAuthenticated, async (req: any, res) => {
    try {
      const { organizationId } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, organizationId)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }

      const teams = await storage.getTeamsByOrganization(organizationId);
      res.json(teams);
    } catch (error) {
      console.error("Error fetching teams:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // Create new team (admin only)
  app.post("/api/teams", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { organizationId, name, description, color } = req.body;

      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, organizationId)
        ));

      if (!membership || (membership.role !== OrganizationRole.ADMIN && membership.role !== OrganizationRole.OWNER)) {
        return res.status(403).json({ message: "Only admins can create teams" });
      }

      const team = await storage.createTeam({
        organizationId,
        name,
        description,
        color,
        createdById: user.id,
      });

      res.status(201).json(team);
    } catch (error) {
      console.error("Error creating team:", error);
      res.status(500).json({ message: "Failed to create team" });
    }
  });

  // Update team
  app.put("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const team = await storage.getTeam(id);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, team.organizationId)
        ));

      if (!membership || (membership.role !== OrganizationRole.ADMIN && membership.role !== OrganizationRole.OWNER)) {
        return res.status(403).json({ message: "Only admins can update teams" });
      }

      const { name, description, color } = req.body;
      const updatedTeam = await storage.updateTeam(id, { name, description, color });
      res.json(updatedTeam);
    } catch (error) {
      console.error("Error updating team:", error);
      res.status(500).json({ message: "Failed to update team" });
    }
  });

  // Delete team
  app.delete("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const team = await storage.getTeam(id);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, team.organizationId)
        ));

      if (!membership || (membership.role !== OrganizationRole.ADMIN && membership.role !== OrganizationRole.OWNER)) {
        return res.status(403).json({ message: "Only admins can delete teams" });
      }

      const success = await storage.deleteTeam(id);
      if (!success) {
        return res.status(404).json({ message: "Team not found" });
      }

      res.json({ message: "Team deleted successfully" });
    } catch (error) {
      console.error("Error deleting team:", error);
      res.status(500).json({ message: "Failed to delete team" });
    }
  });

  // ========================================
  // TEAM MEMBERS ROUTES
  // ========================================

  // Get team members
  app.get("/api/teams/:teamId/members", isAuthenticated, async (req: any, res) => {
    try {
      const { teamId } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, team.organizationId)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }

      const members = await storage.getTeamMembers(teamId);
      
      // Transform members to flatten the user object for frontend compatibility
      const transformedMembers = members.map((member: any) => ({
        id: member.id,
        teamId: member.teamId,
        userId: member.userId,
        createdAt: member.createdAt,
        // Flatten user properties to top level
        email: member.user?.email || '',
        firstName: member.user?.firstName || null,
        lastName: member.user?.lastName || null,
        profileImageUrl: member.user?.profileImageUrl || null,
      }));
      
      res.json(transformedMembers);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  // Add team member (admin only)
  app.post("/api/teams/:teamId/members", isAuthenticated, async (req: any, res) => {
    try {
      const { teamId } = req.params;
      const { userId: keycloakUserId } = req.body; // userId from frontend is the Keycloak UUID
      const userEmail = req.user.claims.email;
      
      console.log("[POST /api/teams/:teamId/members] Starting - teamId:", teamId, "keycloakUserId:", keycloakUserId);
      
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        console.log("[POST /api/teams/:teamId/members] Current user not found");
        return res.status(401).json({ message: "User not found" });
      }

      const team = await storage.getTeam(teamId);
      if (!team) {
        console.log("[POST /api/teams/:teamId/members] Team not found:", teamId);
        return res.status(404).json({ message: "Team not found" });
      }
      
      console.log("[POST /api/teams/:teamId/members] Team found, organizationId:", team.organizationId);

      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, team.organizationId)
        ));

      if (!membership || (membership.role !== OrganizationRole.ADMIN && membership.role !== OrganizationRole.OWNER)) {
        console.log("[POST /api/teams/:teamId/members] User not admin - membership:", membership);
        return res.status(403).json({ message: "Only admins can add team members" });
      }

      // Get the user's info from Keycloak to find their email
      console.log("[POST /api/teams/:teamId/members] Looking up Keycloak user:", keycloakUserId);
      const keycloakUser = await keycloakAdmin.getUserById(keycloakUserId);
      console.log("[POST /api/teams/:teamId/members] Keycloak user result:", keycloakUser);
      
      if (!keycloakUser || !keycloakUser.email) {
        console.log("[POST /api/teams/:teamId/members] Keycloak user not found or no email");
        return res.status(404).json({ message: "User not found in Keycloak" });
      }

      // Find the local user by email
      console.log("[POST /api/teams/:teamId/members] Looking up local user by email:", keycloakUser.email);
      const [targetUser] = await db.select().from(users).where(eq(users.email, keycloakUser.email));
      if (!targetUser) {
        console.log("[POST /api/teams/:teamId/members] Local user not found for email:", keycloakUser.email);
        return res.status(404).json({ message: "User not found in local database" });
      }
      
      console.log("[POST /api/teams/:teamId/members] Found local user:", targetUser.id);

      // Verify target user is a member of the same organization as the team
      const [targetMembership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.userId, targetUser.id),
          eq(organizationMembers.organizationId, team.organizationId)
        ));

      if (!targetMembership) {
        console.log("[POST /api/teams/:teamId/members] Target user not member of organization");
        return res.status(400).json({ message: "User is not a member of this organization" });
      }

      console.log("[POST /api/teams/:teamId/members] Adding team member - teamId:", teamId, "userId:", targetUser.id);
      const member = await storage.addTeamMember({ teamId, userId: targetUser.id });
      console.log("[POST /api/teams/:teamId/members] Success! Member added:", member);
      res.status(201).json(member);
    } catch (error) {
      console.error("[POST /api/teams/:teamId/members] Error adding team member:", error);
      res.status(500).json({ message: "Failed to add team member" });
    }
  });

  // Remove team member (admin only)
  app.delete("/api/teams/:teamId/members/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const { teamId, userId } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, team.organizationId)
        ));

      if (!membership || (membership.role !== OrganizationRole.ADMIN && membership.role !== OrganizationRole.OWNER)) {
        return res.status(403).json({ message: "Only admins can remove team members" });
      }

      const success = await storage.removeTeamMember(teamId, userId);
      if (!success) {
        return res.status(404).json({ message: "Team member not found" });
      }

      res.json({ message: "Team member removed successfully" });
    } catch (error) {
      console.error("Error removing team member:", error);
      res.status(500).json({ message: "Failed to remove team member" });
    }
  });

  // ========================================
  // BOARD TEAM PERMISSIONS ROUTES
  // ========================================

  // Get board teams
  app.get("/api/boards/:boardId/teams", isAuthenticated, async (req: any, res) => {
    try {
      const { boardId } = req.params;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { allowed } = await verifyBoardAccess(boardId, keycloakUserId, user.id);
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      const boardTeams = await storage.getBoardTeams(boardId);
      res.json(boardTeams);
    } catch (error) {
      console.error("Error fetching board teams:", error);
      res.status(500).json({ message: "Failed to fetch board teams" });
    }
  });

  // Assign team to board (admin only)
  app.post("/api/boards/:boardId/teams", isAuthenticated, async (req: any, res) => {
    try {
      const { boardId } = req.params;
      const { teamId, permission } = req.body;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { board, allowed } = await verifyBoardAccess(boardId, keycloakUserId, user.id);
      if (!board || !allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, board.projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership || membership.role !== ProjectRole.ADMIN) {
        return res.status(403).json({ message: "Only project admins can assign teams to boards" });
      }

      const boardTeam = await storage.assignTeamToBoard({
        boardId,
        teamId,
        permission: permission || 'view',
      });

      res.status(201).json(boardTeam);
    } catch (error) {
      console.error("Error assigning team to board:", error);
      res.status(500).json({ message: "Failed to assign team to board" });
    }
  });

  // Update board team permission (admin only)
  app.put("/api/boards/:boardId/teams/:teamId", isAuthenticated, async (req: any, res) => {
    try {
      const { boardId, teamId } = req.params;
      const { permission } = req.body;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { board, allowed } = await verifyBoardAccess(boardId, keycloakUserId, user.id);
      if (!board || !allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, board.projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership || membership.role !== ProjectRole.ADMIN) {
        return res.status(403).json({ message: "Only project admins can update team permissions" });
      }

      const updated = await storage.updateBoardTeamPermission(boardId, teamId, permission);
      res.json(updated);
    } catch (error) {
      console.error("Error updating board team permission:", error);
      res.status(500).json({ message: "Failed to update permission" });
    }
  });

  // Remove team from board (admin only)
  app.delete("/api/boards/:boardId/teams/:teamId", isAuthenticated, async (req: any, res) => {
    try {
      const { boardId, teamId } = req.params;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { board, allowed } = await verifyBoardAccess(boardId, keycloakUserId, user.id);
      if (!board || !allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, board.projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership || membership.role !== ProjectRole.ADMIN) {
        return res.status(403).json({ message: "Only project admins can remove teams from boards" });
      }

      const success = await storage.removeTeamFromBoard(boardId, teamId);
      if (!success) {
        return res.status(404).json({ message: "Board team assignment not found" });
      }

      res.json({ message: "Team removed from board successfully" });
    } catch (error) {
      console.error("Error removing team from board:", error);
      res.status(500).json({ message: "Failed to remove team from board" });
    }
  });

  // ========================================
  // PROJECT TEAM PERMISSIONS ROUTES
  // ========================================

  // Get project teams
  app.get("/api/projects/:projectId/teams", isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { allowed } = await verifyProjectAccess(projectId, keycloakUserId, user.id);
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      const projectTeams = await storage.getProjectTeams(projectId);
      res.json(projectTeams);
    } catch (error) {
      console.error("Error fetching project teams:", error);
      res.status(500).json({ message: "Failed to fetch project teams" });
    }
  });

  // Assign team to project (admin only)
  app.post("/api/projects/:projectId/teams", isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const { teamId, permission } = req.body;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { allowed } = await verifyProjectAccess(projectId, keycloakUserId, user.id);
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership || membership.role !== ProjectRole.ADMIN) {
        return res.status(403).json({ message: "Only project admins can assign teams to projects" });
      }

      const projectTeam = await storage.assignTeamToProject({
        projectId,
        teamId,
        permission: permission || 'view',
      });

      res.status(201).json(projectTeam);
    } catch (error) {
      console.error("Error assigning team to project:", error);
      res.status(500).json({ message: "Failed to assign team to project" });
    }
  });

  // Update project team permission (admin only)
  app.put("/api/projects/:projectId/teams/:teamId", isAuthenticated, async (req: any, res) => {
    try {
      const { projectId, teamId } = req.params;
      const { permission } = req.body;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { allowed } = await verifyProjectAccess(projectId, keycloakUserId, user.id);
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership || membership.role !== ProjectRole.ADMIN) {
        return res.status(403).json({ message: "Only project admins can update team permissions" });
      }

      const updated = await storage.updateProjectTeamPermission(projectId, teamId, permission);
      res.json(updated);
    } catch (error) {
      console.error("Error updating project team permission:", error);
      res.status(500).json({ message: "Failed to update permission" });
    }
  });

  // Remove team from project (admin only)
  app.delete("/api/projects/:projectId/teams/:teamId", isAuthenticated, async (req: any, res) => {
    try {
      const { projectId, teamId } = req.params;
      const userEmail = req.user.claims.email;
      const keycloakUserId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { allowed } = await verifyProjectAccess(projectId, keycloakUserId, user.id);
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership || membership.role !== ProjectRole.ADMIN) {
        return res.status(403).json({ message: "Only project admins can remove teams from projects" });
      }

      const success = await storage.removeTeamFromProject(projectId, teamId);
      if (!success) {
        return res.status(404).json({ message: "Project team assignment not found" });
      }

      res.json({ message: "Team removed from project successfully" });
    } catch (error) {
      console.error("Error removing team from project:", error);
      res.status(500).json({ message: "Failed to remove team from project" });
    }
  });

  // ========================================
  // INVITATIONS ROUTES (Admin Only)
  // ========================================

  // Get organization invitations
  app.get("/api/organizations/:organizationId/invitations", isAuthenticated, async (req: any, res) => {
    try {
      const { organizationId } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, organizationId)
        ));

      if (!membership || (membership.role !== OrganizationRole.ADMIN && membership.role !== OrganizationRole.OWNER)) {
        return res.status(403).json({ message: "Only admins can view invitations" });
      }

      const invitations = await storage.getOrganizationInvitations(organizationId);
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  // Create invitation (admin only)
  app.post("/api/invitations", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { organizationId, email, role } = req.body;

      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, organizationId)
        ));

      if (!membership || (membership.role !== OrganizationRole.ADMIN && membership.role !== OrganizationRole.OWNER)) {
        return res.status(403).json({ message: "Only admins can send invitations" });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invitation = await storage.createInvitation({
        organizationId,
        email,
        role: role || OrganizationRole.MEMBER,
        status: 'pending',
        expiresAt,
        invitedById: user.id,
      });

      res.status(201).json(invitation);
    } catch (error) {
      console.error("Error creating invitation:", error);
      res.status(500).json({ message: "Failed to create invitation" });
    }
  });

  // Delete invitation (admin only)
  app.delete("/api/invitations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const invitation = await storage.getInvitation(id);
      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, invitation.organizationId)
        ));

      if (!membership || (membership.role !== OrganizationRole.ADMIN && membership.role !== OrganizationRole.OWNER)) {
        return res.status(403).json({ message: "Only admins can delete invitations" });
      }

      const success = await storage.deleteInvitation(id);
      if (!success) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      res.json({ message: "Invitation deleted successfully" });
    } catch (error) {
      console.error("Error deleting invitation:", error);
      res.status(500).json({ message: "Failed to delete invitation" });
    }
  });

  // Analytics endpoint
  app.get("/api/analytics/overview", isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const analytics = await storage.getAnalyticsOverview(user.id);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ========================================
  // ADMIN ROUTES - Keycloak Sync
  // ========================================

  /**
   * Sincroniza organizaciones existentes con Keycloak
   * Solo para organization-creators
   */
  app.post("/api/admin/sync-organizations-to-keycloak", isAuthenticated, async (req: any, res) => {
    try {
      const keycloakUserId = req.user.claims.sub;
      
      // Verificar que el usuario sea organization-creator
      const canCreate = await keycloakAdmin.canCreateOrganizations(keycloakUserId);
      
      if (!canCreate) {
        return res.status(403).json({ 
          message: "Solo los creadores de organizaciones pueden ejecutar esta sincronización" 
        });
      }

      // Obtener todas las organizaciones
      const allOrgs = await db.select().from(organizations);
      
      const results = {
        total: allOrgs.length,
        synced: 0,
        alreadyExists: 0,
        errors: [] as any[]
      };

      for (const org of allOrgs) {
        try {
          // Verificar si el grupo ya existe en Keycloak
          const groups = await keycloakAdmin.findGroups(`org-${org.id}`);

          if (groups.length > 0) {
            console.log(`[Sync] Organización ${org.id} ya tiene grupo en Keycloak`);
            results.alreadyExists++;
            continue;
          }

          // Crear grupo en Keycloak
          console.log(`[Sync] Creando grupo en Keycloak para organización: ${org.id}`);
          await keycloakAdmin.createOrganizationGroup(org.id, org.name);

          // Obtener el owner de la BD local
          const [ownerMembership] = await db
            .select()
            .from(organizationMembers)
            .where(and(
              eq(organizationMembers.organizationId, org.id),
              eq(organizationMembers.role, OrganizationRole.OWNER)
            ))
            .limit(1);

          if (ownerMembership) {
            // Buscar el usuario por su ID local
            const [ownerUser] = await db
              .select()
              .from(users)
              .where(eq(users.id, ownerMembership.userId))
              .limit(1);

            if (ownerUser && ownerUser.email) {
              // Buscar el usuario en Keycloak por email
              const kcUsers = await keycloakAdmin.findUsersByEmail(ownerUser.email, true);

              if (kcUsers.length > 0) {
                const kcUserId = kcUsers[0].id!;
                // Asignar al owner al grupo
                await keycloakAdmin.assignUserToOrganizationRole(kcUserId, org.id, 'owner');
                console.log(`[Sync] Owner asignado a organización ${org.id}`);
              }
            }
          }

          results.synced++;
        } catch (error) {
          console.error(`[Sync] Error al sincronizar organización ${org.id}:`, error);
          results.errors.push({
            organizationId: org.id,
            organizationName: org.name,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      res.json({
        success: true,
        message: "Sincronización completada",
        results
      });
    } catch (error) {
      console.error("Error en sincronización de organizaciones:", error);
      res.status(500).json({ 
        message: "Error al sincronizar organizaciones",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
