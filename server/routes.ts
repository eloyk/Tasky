import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { setupAuth, isAuthenticated } from "./keycloakAuth.js";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage.js";
import { ObjectPermission, getObjectAclPolicy, setObjectAclPolicy } from "./objectAcl.js";
import { 
  insertTaskSchema, 
  insertCommentSchema, 
  insertAttachmentSchema,
  insertTaskRelationshipSchema,
  insertOrganizationSchema,
  insertProjectSchema,
  insertOrganizationMemberSchema,
  insertProjectMemberSchema,
  insertProjectColumnSchema,
  insertBoardSchema,
  users,
  organizations,
  projects,
  tasks,
  taskRelationships,
  organizationMembers,
  projectMembers,
  projectColumns,
  boards,
  OrganizationRole,
  ProjectRole
} from "../shared/schema.js";
import { db } from "./db.js";
import { eq, and, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { createDefaultProjectColumns } from "./projectHelpers.js";
import type { Task, Board, Project } from "../shared/schema.js";

// Helper function to verify user has access to a task
async function verifyTaskAccess(taskId: string, userId: string): Promise<{ task: Task | null; allowed: boolean }> {
  const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  
  if (taskResult.length === 0) {
    return { task: null, allowed: false };
  }
  
  const task = taskResult[0];
  
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
async function verifyBoardAccess(boardId: string, userId: string): Promise<{ board: Board | null; allowed: boolean }> {
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
    board,
    allowed: membership.length > 0
  };
}

// Helper function to verify user has access to a project
async function verifyProjectAccess(projectId: string, userId: string): Promise<{ project: Project | null; allowed: boolean }> {
  const projectResult = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  
  if (projectResult.length === 0) {
    return { project: null, allowed: false };
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
    project,
    allowed: membership.length > 0
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userEmail = req.user?.claims?.email;
      if (!userEmail) {
        console.error("[/api/auth/user] No email found in req.user");
        return res.status(401).json({ message: "No user email in session" });
      }
      
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      if (!user) {
        console.error(`[/api/auth/user] User not found in database: ${userEmail}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      console.log("[/api/auth/user] Returning user:", user.email);
      res.json(user);
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
      const userTasks = await db
        .select()
        .from(tasks)
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

      // Verify that the target column belongs to the same project as the task
      const [targetColumn] = await db
        .select()
        .from(projectColumns)
        .where(eq(projectColumns.id, columnId));

      if (!targetColumn) {
        return res.status(404).json({ message: "Column not found" });
      }

      // Get the board to verify it belongs to the same project as the task
      const [targetBoard] = await db
        .select()
        .from(boards)
        .where(eq(boards.id, targetColumn.boardId));

      if (!targetBoard || targetBoard.projectId !== oldTask.projectId) {
        return res.status(400).json({ message: "Column does not belong to task's project" });
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
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
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
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const validatedData = insertOrganizationSchema.parse({
        ...req.body,
        ownerId: user.id,
      });

      const [organization] = await db.insert(organizations).values(validatedData).returning();

      // Add owner as member with owner role
      await db.insert(organizationMembers).values({
        organizationId: organization.id,
        userId: user.id,
        role: OrganizationRole.OWNER,
      });

      res.json(organization);
    } catch (error) {
      console.error("Error creating organization:", error);
      res.status(400).json({ message: "Failed to create organization" });
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

  app.post("/api/organizations/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { userEmail: memberEmail, role } = req.body;
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
        return res.status(403).json({ message: "Not authorized to add members" });
      }

      // Find member by email
      const [memberUser] = await db.select().from(users).where(eq(users.email, memberEmail));
      
      if (!memberUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const validatedData = insertOrganizationMemberSchema.parse({
        organizationId: id,
        userId: memberUser.id,
        role: role || OrganizationRole.MEMBER,
      });

      const [member] = await db.insert(organizationMembers).values(validatedData).returning();

      res.json(member);
    } catch (error) {
      console.error("Error adding organization member:", error);
      res.status(400).json({ message: "Failed to add member" });
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
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get all projects where user is a member
      const userProjects = await db
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
        .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
        .where(eq(projectMembers.userId, user.id));

      res.json(userProjects);
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

      // Create default columns for the project
      await createDefaultProjectColumns(project.id);

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

  app.get("/api/projects/:id/columns", isAuthenticated, async (req: any, res) => {
    try {
      const { id: projectId } = req.params;
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
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this project" });
      }

      // Get all boards for this project
      const projectBoards = await db
        .select()
        .from(boards)
        .where(eq(boards.projectId, projectId));

      if (projectBoards.length === 0) {
        return res.json([]);
      }

      // Get columns from all boards ordered by order field
      const boardIds = projectBoards.map(board => board.id);
      const columns = await db
        .select()
        .from(projectColumns)
        .where(sql`${projectColumns.boardId} = ANY(${boardIds})`)
        .orderBy(projectColumns.order);

      res.json(columns);
    } catch (error) {
      console.error("Error fetching project columns:", error);
      res.status(500).json({ message: "Failed to fetch project columns" });
    }
  });

  app.post("/api/projects/:id/columns", isAuthenticated, async (req: any, res) => {
    try {
      const { id: projectId } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Verify project exists first
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check if user is a member and admin of the project
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this project" });
      }

      if (membership.role !== ProjectRole.ADMIN) {
        return res.status(403).json({ message: "Only project admins can add columns" });
      }

      // Get the first board of the project (for backward compatibility)
      const [firstBoard] = await db
        .select()
        .from(boards)
        .where(eq(boards.projectId, projectId))
        .limit(1);

      if (!firstBoard) {
        return res.status(404).json({ message: "No board found for this project" });
      }

      // Get max order to place new column at the end
      const maxOrder = await db
        .select({ maxOrder: sql<number>`COALESCE(MAX(${projectColumns.order}), -1)` })
        .from(projectColumns)
        .where(eq(projectColumns.boardId, firstBoard.id));

      // Validate input with Zod schema using safeParse
      const validation = insertProjectColumnSchema.safeParse({
        name: req.body.name,
        boardId: firstBoard.id,
        order: (maxOrder[0]?.maxOrder ?? -1) + 1,
      });

      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid column data", 
          errors: validation.error.errors 
        });
      }

      const [newColumn] = await db.insert(projectColumns).values(validation.data).returning();

      res.json(newColumn);
    } catch (error) {
      console.error("Error creating project column:", error);
      res.status(500).json({ message: "Failed to create column" });
    }
  });

  app.patch("/api/projects/:id/columns/:columnId", isAuthenticated, async (req: any, res) => {
    try {
      const { id: projectId, columnId } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Verify column exists first
      const [existingColumn] = await db
        .select()
        .from(projectColumns)
        .where(eq(projectColumns.id, columnId));

      if (!existingColumn) {
        return res.status(404).json({ message: "Column not found" });
      }

      // Get the board to verify it belongs to the project
      const [board] = await db
        .select()
        .from(boards)
        .where(and(
          eq(boards.id, existingColumn.boardId),
          eq(boards.projectId, projectId)
        ));

      if (!board) {
        return res.status(404).json({ message: "Column does not belong to this project" });
      }

      // Check if user is admin of the project
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this project" });
      }

      if (membership.role !== ProjectRole.ADMIN) {
        return res.status(403).json({ message: "Only project admins can update columns" });
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
        .update(projectColumns)
        .set({ name: validation.data })
        .where(eq(projectColumns.id, columnId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating project column:", error);
      res.status(500).json({ message: "Failed to update column" });
    }
  });

  app.delete("/api/projects/:id/columns/:columnId", isAuthenticated, async (req: any, res) => {
    try {
      const { id: projectId, columnId } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Verify column exists first
      const [columnToDelete] = await db
        .select()
        .from(projectColumns)
        .where(eq(projectColumns.id, columnId));

      if (!columnToDelete) {
        return res.status(404).json({ message: "Column not found" });
      }

      // Get the board to verify it belongs to the project
      const [board] = await db
        .select()
        .from(boards)
        .where(and(
          eq(boards.id, columnToDelete.boardId),
          eq(boards.projectId, projectId)
        ));

      if (!board) {
        return res.status(404).json({ message: "Column does not belong to this project" });
      }

      // Check if user is admin of the project
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this project" });
      }

      if (membership.role !== ProjectRole.ADMIN) {
        return res.status(403).json({ message: "Only project admins can delete columns" });
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
        .delete(projectColumns)
        .where(eq(projectColumns.id, columnId));

      res.json({ message: "Column deleted successfully" });
    } catch (error) {
      console.error("Error deleting project column:", error);
      res.status(500).json({ message: "Failed to delete column" });
    }
  });

  app.patch("/api/projects/:id/columns/reorder", isAuthenticated, async (req: any, res) => {
    try {
      const { id: projectId } = req.params;
      const userEmail = req.user.claims.email;
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Verify project exists first
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check if user is admin of the project
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, user.id)
        ));

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this project" });
      }

      if (membership.role !== ProjectRole.ADMIN) {
        return res.status(403).json({ message: "Only project admins can reorder columns" });
      }

      // Validate columns array using safeParse
      const columnsSchema = z.array(z.object({
        id: z.string(),
        order: z.number().int().min(0)
      })).min(1, "At least one column is required");
      
      const validation = columnsSchema.safeParse(req.body.columns);
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid column data", 
          errors: validation.error.errors 
        });
      }

      // Get all boards for this project
      const projectBoards = await db
        .select()
        .from(boards)
        .where(eq(boards.projectId, projectId));

      if (projectBoards.length === 0) {
        return res.status(404).json({ message: "No boards found for this project" });
      }

      const boardIds = projectBoards.map(board => board.id);

      // Update order for each column (verify they belong to this project's boards)
      for (const column of validation.data) {
        await db
          .update(projectColumns)
          .set({ order: column.order })
          .where(and(
            eq(projectColumns.id, column.id),
            sql`${projectColumns.boardId} = ANY(${boardIds})`
          ));
      }

      // Return updated columns
      const updatedColumns = await db
        .select()
        .from(projectColumns)
        .where(sql`${projectColumns.boardId} = ANY(${boardIds})`)
        .orderBy(projectColumns.order);

      res.json(updatedColumns);
    } catch (error) {
      console.error("Error reordering project columns:", error);
      res.status(500).json({ message: "Failed to reorder columns" });
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
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // CRITICAL: Verify user has access to the board
      const { board, allowed } = await verifyBoardAccess(id, user.id);
      
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
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // CRITICAL: Verify user has access to the board
      const { board, allowed } = await verifyBoardAccess(id, user.id);
      
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
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // CRITICAL: Verify user has access to the board
      const { board, allowed } = await verifyBoardAccess(boardId, user.id);
      
      if (!board) {
        return res.status(404).json({ message: "Board not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get columns for this board
      const columns = await db
        .select()
        .from(projectColumns)
        .where(eq(projectColumns.boardId, boardId))
        .orderBy(projectColumns.order);

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
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // CRITICAL: Verify user has access to the board
      const { board, allowed } = await verifyBoardAccess(id, user.id);
      
      if (!board) {
        return res.status(404).json({ message: "Board not found" });
      }
      
      if (!allowed) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get tasks for this board
      const tasks = await storage.getTasksByBoard(id);
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
      const [user] = await db.select().from(users).where(eq(users.email, userEmail));
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // CRITICAL: Verify user has access to the board
      const { board, allowed } = await verifyBoardAccess(id, user.id);
      
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

  const httpServer = createServer(app);

  return httpServer;
}
