import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./keycloakAuth";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage";
import { ObjectPermission, getObjectAclPolicy, setObjectAclPolicy } from "./objectAcl";
import { insertTaskSchema, insertCommentSchema, insertAttachmentSchema, users } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

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
      const tasks = await storage.getAllTasks();
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  app.get("/api/tasks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const task = await storage.getTask(id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      console.error("Error fetching task:", error);
      res.status(500).json({ message: "Failed to fetch task" });
    }
  });

  app.post("/api/tasks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertTaskSchema.parse({
        ...req.body,
        createdById: userId,
      });
      const task = await storage.createTask(validatedData);
      
      // Log task creation
      await storage.createActivityLog({
        taskId: task.id,
        userId: userId,
        actionType: "created",
        fieldName: "task",
        newValue: task.title,
      });

      res.json(task);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(400).json({ message: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user.claims.sub;
      
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      // Get old task state before updating
      const oldTask = await storage.getTask(id);
      const task = await storage.updateTaskStatus(id, status);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Log status change
      if (oldTask && oldTask.status !== status) {
        await storage.createActivityLog({
          taskId: id,
          userId: userId,
          actionType: "status_change",
          fieldName: "status",
          oldValue: oldTask.status,
          newValue: status,
        });
      }

      res.json(task);
    } catch (error) {
      console.error("Error updating task status:", error);
      res.status(500).json({ message: "Failed to update task status" });
    }
  });

  app.delete("/api/tasks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteTask(id);
      res.json({ message: "Task deleted successfully" });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  app.get("/api/tasks/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
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
      const userId = req.user.claims.sub;
      
      const validatedData = insertCommentSchema.parse({
        taskId: id,
        userId: userId,
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
      const activity = await storage.getTaskActivity(id);
      res.json(activity);
    } catch (error) {
      console.error("Error fetching activity:", error);
      res.status(500).json({ message: "Failed to fetch activity" });
    }
  });

  app.post("/api/tasks/:id/attachments", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
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
            owner: userId,
            visibility: "private",
          });
        } else {
          // Verify the user has write permission to this object
          const canAccess = await objectStorageService.canAccessObjectEntity({
            objectFile,
            userId: userId,
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
        userId: userId,
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

  const httpServer = createServer(app);

  return httpServer;
}
