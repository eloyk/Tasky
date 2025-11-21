import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Organizations table
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  ownerId: varchar("owner_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

// Organization member roles
export const OrganizationRole = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export type OrganizationRoleType = typeof OrganizationRole[keyof typeof OrganizationRole];

// Organization members table
export const organizationMembers = pgTable("organization_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default(OrganizationRole.MEMBER),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOrganizationMemberSchema = createInsertSchema(organizationMembers).omit({
  id: true,
  createdAt: true,
});

export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;
export type OrganizationMember = typeof organizationMembers.$inferSelect;

// Projects table
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdById: varchar("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// Project member roles
export const ProjectRole = {
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export type ProjectRoleType = typeof ProjectRole[keyof typeof ProjectRole];

// Project members table
export const projectMembers = pgTable("project_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default(ProjectRole.MEMBER),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectMemberSchema = createInsertSchema(projectMembers).omit({
  id: true,
  createdAt: true,
});

export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;
export type ProjectMember = typeof projectMembers.$inferSelect;

// Boards table - múltiples tableros por proyecto
export const boards = pgTable("boards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdById: varchar("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBoardSchema = createInsertSchema(boards).omit({
  id: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBoard = z.infer<typeof insertBoardSchema>;
export type Board = typeof boards.$inferSelect;

// Board columns table - columnas personalizables para cada tablero
export const boardColumns = pgTable("board_columns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  boardId: varchar("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  order: integer("order").notNull(),
  color: varchar("color", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueBoardOrder: uniqueIndex("unique_board_order").on(table.boardId, table.order),
}));

export const insertBoardColumnSchema = createInsertSchema(boardColumns).omit({
  id: true,
  createdAt: true,
});

export type InsertBoardColumn = z.infer<typeof insertBoardColumnSchema>;
export type BoardColumn = typeof boardColumns.$inferSelect;

// Task priority enum
export const TaskPriority = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export type TaskPriorityType = typeof TaskPriority[keyof typeof TaskPriority];

// Tasks table
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  boardId: varchar("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  columnId: varchar("column_id").notNull().references(() => boardColumns.id, { onDelete: "restrict" }),
  priority: varchar("priority", { length: 20 }).notNull().default(TaskPriority.MEDIUM),
  dueDate: timestamp("due_date"),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  assigneeId: varchar("assignee_id").references(() => users.id),
  createdById: varchar("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks, {
  boardId: z.string().uuid("Board ID must be a valid UUID"),
  dueDate: z.union([z.string(), z.date()]).optional().nullable().transform((val) => {
    if (!val) return null;
    if (val instanceof Date) return val;
    return new Date(val);
  }),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// Comments table
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

// Attachments table
export const attachments = pgTable("attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAttachmentSchema = createInsertSchema(attachments).omit({
  id: true,
  createdAt: true,
});

export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Attachment = typeof attachments.$inferSelect;

// Activity Log table for tracking task changes
export const activityLog = pgTable("activity_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  actionType: varchar("action_type").notNull(), // 'created', 'status_change', 'updated', 'deleted'
  fieldName: varchar("field_name"), // e.g., 'status', 'priority', 'title'
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLog).omit({
  id: true,
  createdAt: true,
});

export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLog.$inferSelect;

// Task Relationships table for linking related tasks
export const taskRelationships = pgTable("task_relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  relatedTaskId: varchar("related_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  relationshipType: varchar("relationship_type", { length: 50 }).notNull().default("related"), // 'related', 'blocks', 'blocked_by', 'duplicate'
  createdById: varchar("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskRelationshipSchema = createInsertSchema(taskRelationships).omit({
  id: true,
  createdAt: true,
});

export type InsertTaskRelationship = z.infer<typeof insertTaskRelationshipSchema>;
export type TaskRelationship = typeof taskRelationships.$inferSelect;

// Teams table - Equipos para agrupar usuarios
export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 20 }),
  createdById: varchar("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

// Team members table - Miembros de equipos
export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueTeamUser: uniqueIndex("unique_team_user").on(table.teamId, table.userId),
}));

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  createdAt: true,
});

export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;

// Board team permissions - Asignar equipos a boards con permisos
export const BoardTeamPermission = {
  VIEW: "view",       // Solo ver tareas
  EDIT: "edit",       // Ver y editar tareas
  ADMIN: "admin",     // Control total del board
} as const;

export type BoardTeamPermissionType = typeof BoardTeamPermission[keyof typeof BoardTeamPermission];

export const boardTeams = pgTable("board_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  boardId: varchar("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  teamId: varchar("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  permission: varchar("permission", { length: 20 }).notNull().default(BoardTeamPermission.VIEW),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueBoardTeam: uniqueIndex("unique_board_team").on(table.boardId, table.teamId),
}));

export const insertBoardTeamSchema = createInsertSchema(boardTeams).omit({
  id: true,
  createdAt: true,
});

export type InsertBoardTeam = z.infer<typeof insertBoardTeamSchema>;
export type BoardTeam = typeof boardTeams.$inferSelect;

// Project team permissions - Asignar equipos a proyectos
export const ProjectTeamPermission = {
  VIEW: "view",       // Solo ver
  EDIT: "edit",       // Ver y editar
  ADMIN: "admin",     // Control total
} as const;

export type ProjectTeamPermissionType = typeof ProjectTeamPermission[keyof typeof ProjectTeamPermission];

export const projectTeams = pgTable("project_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  teamId: varchar("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  permission: varchar("permission", { length: 20 }).notNull().default(ProjectTeamPermission.VIEW),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueProjectTeam: uniqueIndex("unique_project_team").on(table.projectId, table.teamId),
}));

export const insertProjectTeamSchema = createInsertSchema(projectTeams).omit({
  id: true,
  createdAt: true,
});

export type InsertProjectTeam = z.infer<typeof insertProjectTeamSchema>;
export type ProjectTeam = typeof projectTeams.$inferSelect;

// Invitations table - Invitar usuarios a la organización
export const InvitationStatus = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  EXPIRED: "expired",
} as const;

export type InvitationStatusType = typeof InvitationStatus[keyof typeof InvitationStatus];

export const invitations = pgTable("invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default(OrganizationRole.MEMBER),
  invitedById: varchar("invited_by_id").notNull().references(() => users.id),
  status: varchar("status", { length: 20 }).notNull().default(InvitationStatus.PENDING),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueOrgEmail: uniqueIndex("unique_org_email_invitation").on(table.organizationId, table.email, table.status),
}));

export const insertInvitationSchema = createInsertSchema(invitations).omit({
  id: true,
  invitedById: true,
  createdAt: true,
});

export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitations.$inferSelect;
