import {
  users,
  tasks,
  comments,
  attachments,
  activityLog,
  type User,
  type UpsertUser,
  type Task,
  type InsertTask,
  type Comment,
  type InsertComment,
  type Attachment,
  type InsertAttachment,
  type ActivityLog,
  type InsertActivityLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  getAllTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTaskStatus(id: string, status: string): Promise<Task | undefined>;
  deleteTask(id: string): Promise<void>;

  getTaskComments(taskId: string): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;

  getTaskAttachments(taskId: string): Promise<Attachment[]>;
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;

  getTaskActivity(taskId: string): Promise<ActivityLog[]>;
  createActivityLog(activity: InsertActivityLog): Promise<ActivityLog>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getAllTasks(): Promise<Task[]> {
    return await db
      .select()
      .from(tasks)
      .orderBy(desc(tasks.createdAt));
  }

  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(taskData: InsertTask): Promise<Task> {
    const [task] = await db
      .insert(tasks)
      .values(taskData)
      .returning();
    return task;
  }

  async updateTaskStatus(id: string, status: string): Promise<Task | undefined> {
    const [task] = await db
      .update(tasks)
      .set({ status, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async getTaskComments(taskId: string): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(eq(comments.taskId, taskId))
      .orderBy(comments.createdAt);
  }

  async createComment(commentData: InsertComment): Promise<Comment> {
    const [comment] = await db
      .insert(comments)
      .values(commentData)
      .returning();
    return comment;
  }

  async getTaskAttachments(taskId: string): Promise<Attachment[]> {
    return await db
      .select()
      .from(attachments)
      .where(eq(attachments.taskId, taskId))
      .orderBy(attachments.createdAt);
  }

  async createAttachment(attachmentData: InsertAttachment): Promise<Attachment> {
    const [attachment] = await db
      .insert(attachments)
      .values(attachmentData)
      .returning();
    return attachment;
  }

  async getTaskActivity(taskId: string): Promise<any[]> {
    return await db
      .select({
        id: activityLog.id,
        taskId: activityLog.taskId,
        userId: activityLog.userId,
        actionType: activityLog.actionType,
        fieldName: activityLog.fieldName,
        oldValue: activityLog.oldValue,
        newValue: activityLog.newValue,
        createdAt: activityLog.createdAt,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(activityLog)
      .leftJoin(users, eq(activityLog.userId, users.id))
      .where(eq(activityLog.taskId, taskId))
      .orderBy(desc(activityLog.createdAt));
  }

  async createActivityLog(activityData: InsertActivityLog): Promise<ActivityLog> {
    const [activity] = await db
      .insert(activityLog)
      .values(activityData)
      .returning();
    return activity;
  }
}

export const storage = new DatabaseStorage();
