import {
  users,
  tasks,
  comments,
  attachments,
  activityLog,
  boards,
  boardColumns,
  organizationMembers,
  projects,
  teams,
  teamMembers,
  boardTeams,
  projectTeams,
  invitations,
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
  type Board,
  type InsertBoard,
  type Team,
  type InsertTeam,
  type TeamMember,
  type InsertTeamMember,
  type BoardTeam,
  type InsertBoardTeam,
  type ProjectTeam,
  type InsertProjectTeam,
  type Invitation,
  type InsertInvitation,
} from "../shared/schema.js";
import { db } from "./db.js";
import { eq, desc, and, gte, lte, sql, count, inArray, isNotNull } from "drizzle-orm";

export interface AnalyticsOverview {
  totalTasks: number;
  tasksByStatus: { columnName: string; count: number }[];
  tasksByPriority: { priority: string; count: number }[];
  overdueTasks: number;
  completedLast7Days: number;
  upcomingDueTasks: number;
  recentActivity: any[];
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  getAllTasks(): Promise<Task[]>;
  getTasksByProject(projectId: string): Promise<Task[]>;
  getTasksByBoard(boardId: string): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTaskColumn(id: string, columnId: string): Promise<Task | undefined>;
  deleteTask(id: string): Promise<void>;

  getTaskComments(taskId: string): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;

  getTaskAttachments(taskId: string): Promise<Attachment[]>;
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;

  getTaskActivity(taskId: string): Promise<ActivityLog[]>;
  createActivityLog(activity: InsertActivityLog): Promise<ActivityLog>;

  createBoard(data: InsertBoard & { createdById: string }): Promise<Board>;
  getBoard(id: string): Promise<Board | undefined>;
  getBoardsByProject(projectId: string): Promise<Board[]>;
  updateBoard(id: string, data: Partial<InsertBoard>): Promise<Board | undefined>;
  deleteBoard(id: string): Promise<boolean>;

  getAnalyticsOverview(userId: string): Promise<AnalyticsOverview>;

  updateUserProfile(userId: string, data: Partial<Pick<User, 'firstName' | 'lastName' | 'profileImageUrl'>>): Promise<User | undefined>;

  createTeam(data: InsertTeam & { createdById: string }): Promise<Team>;
  getTeam(id: string): Promise<Team | undefined>;
  getTeamsByOrganization(organizationId: string): Promise<Team[]>;
  updateTeam(id: string, data: Partial<InsertTeam>): Promise<Team | undefined>;
  deleteTeam(id: string): Promise<boolean>;

  addTeamMember(data: InsertTeamMember): Promise<TeamMember>;
  removeTeamMember(teamId: string, userId: string): Promise<boolean>;
  getTeamMembers(teamId: string): Promise<TeamMember[]>;
  getUserTeams(userId: string): Promise<Team[]>;

  assignTeamToBoard(data: InsertBoardTeam): Promise<BoardTeam>;
  removeTeamFromBoard(boardId: string, teamId: string): Promise<boolean>;
  getBoardTeams(boardId: string): Promise<BoardTeam[]>;
  updateBoardTeamPermission(boardId: string, teamId: string, permission: string): Promise<BoardTeam | undefined>;

  assignTeamToProject(data: InsertProjectTeam): Promise<ProjectTeam>;
  removeTeamFromProject(projectId: string, teamId: string): Promise<boolean>;
  getProjectTeams(projectId: string): Promise<ProjectTeam[]>;
  updateProjectTeamPermission(projectId: string, teamId: string, permission: string): Promise<ProjectTeam | undefined>;

  createInvitation(data: InsertInvitation & { invitedById: string }): Promise<Invitation>;
  getInvitation(id: string): Promise<Invitation | undefined>;
  getOrganizationInvitations(organizationId: string): Promise<Invitation[]>;
  updateInvitationStatus(id: string, status: string): Promise<Invitation | undefined>;
  deleteInvitation(id: string): Promise<boolean>;

  getUsersWithBoardAccess(boardId: string): Promise<User[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existingByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, userData.email!))
      .limit(1);

    if (existingByEmail.length > 0) {
      const [updatedUser] = await db
        .update(users)
        .set({
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.email, userData.email!))
        .returning();
      return updatedUser;
    }

    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
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

  async getTasksByProject(projectId: string): Promise<Task[]> {
    return await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(desc(tasks.createdAt));
  }

  async getTasksByBoard(boardId: string): Promise<Task[]> {
    // Get all tasks for this specific board
    return await db
      .select()
      .from(tasks)
      .where(eq(tasks.boardId, boardId))
      .orderBy(desc(tasks.createdAt));
  }

  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(taskData: InsertTask & { createdById: string }): Promise<Task> {
    const [task] = await db
      .insert(tasks)
      .values(taskData)
      .returning();
    return task;
  }

  async updateTaskColumn(id: string, columnId: string): Promise<Task | undefined> {
    const [task] = await db
      .update(tasks)
      .set({ columnId, updatedAt: new Date() })
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

  async createBoard(boardData: InsertBoard & { createdById: string }): Promise<Board> {
    const [board] = await db
      .insert(boards)
      .values(boardData)
      .returning();
    return board;
  }

  async getBoard(id: string): Promise<Board | undefined> {
    const [board] = await db.select().from(boards).where(eq(boards.id, id));
    return board;
  }

  async getBoardsByProject(projectId: string): Promise<Board[]> {
    return await db
      .select()
      .from(boards)
      .where(eq(boards.projectId, projectId))
      .orderBy(desc(boards.createdAt));
  }

  async updateBoard(id: string, data: Partial<InsertBoard>): Promise<Board | undefined> {
    const [board] = await db
      .update(boards)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(boards.id, id))
      .returning();
    return board;
  }

  async deleteBoard(id: string): Promise<boolean> {
    const result = await db.delete(boards).where(eq(boards.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getAnalyticsOverview(userId: string): Promise<AnalyticsOverview> {
    // Get organizations where user is a member
    const userOrgs = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));
    
    if (userOrgs.length === 0) {
      return {
        totalTasks: 0,
        overdueTasks: 0,
        completedLast7Days: 0,
        upcomingDueTasks: 0,
        tasksByStatus: [],
        tasksByPriority: [],
        recentActivity: [],
      };
    }
    
    // Get projects from those organizations
    const orgIds = userOrgs.map(o => o.organizationId);
    const userProjects = await db
      .select()
      .from(projects)
      .where(inArray(projects.organizationId, orgIds));
    
    const projectIds = userProjects.map(p => p.id);
    
    if (projectIds.length === 0) {
      return {
        totalTasks: 0,
        overdueTasks: 0,
        completedLast7Days: 0,
        upcomingDueTasks: 0,
        tasksByStatus: [],
        tasksByPriority: [],
        recentActivity: [],
      };
    }
    
    // Get tasks from those projects
    const userTasks = await db
      .select()
      .from(tasks)
      .where(inArray(tasks.projectId, projectIds));

    const totalTasks = userTasks.length;

    const tasksByStatusResult = await db
      .select({
        columnId: tasks.columnId,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(tasks)
      .where(inArray(tasks.projectId, projectIds))
      .groupBy(tasks.columnId);

    const columnsMap = new Map<string, string>();
    const uniqueColumnIds = Array.from(new Set(tasksByStatusResult.map(t => t.columnId).filter(Boolean)));
    
    if (uniqueColumnIds.length > 0) {
      const columns = await db
        .select()
        .from(boardColumns)
        .where(inArray(boardColumns.id, uniqueColumnIds));
      
      columns.forEach(col => columnsMap.set(col.id, col.name));
    }

    const tasksByStatus = tasksByStatusResult.map(item => ({
      columnName: columnsMap.get(item.columnId) || 'Sin columna',
      count: item.count || 0,
    }));

    const tasksByPriorityResult = await db
      .select({
        priority: tasks.priority,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(tasks)
      .where(inArray(tasks.projectId, projectIds))
      .groupBy(tasks.priority);

    const tasksByPriority = tasksByPriorityResult.map(item => ({
      priority: item.priority || 'medium',
      count: item.count || 0,
    }));

    const now = new Date();
    const overdueTasksResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(tasks)
      .where(
        and(
          inArray(tasks.projectId, projectIds),
          isNotNull(tasks.dueDate),
          lte(tasks.dueDate, now)
        )
      );

    const overdueTasks = overdueTasksResult[0]?.count || 0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let completedLast7Days = 0;
    try {
      const completedLast7DaysResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(tasks)
        .innerJoin(boardColumns, and(
          eq(tasks.columnId, boardColumns.id),
          eq(tasks.boardId, boardColumns.boardId)
        ))
        .where(
          and(
            inArray(tasks.projectId, projectIds),
            isNotNull(tasks.boardId),
            gte(tasks.updatedAt, sevenDaysAgo),
            sql`lower(${boardColumns.name}) LIKE '%completad%'`
          )
        );

      completedLast7Days = completedLast7DaysResult[0]?.count || 0;
    } catch (error) {
      console.warn("Error calculating completedLast7Days, returning 0:", error);
      completedLast7Days = 0;
    }

    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const upcomingDueTasksResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(tasks)
      .where(
        and(
          inArray(tasks.projectId, projectIds),
          isNotNull(tasks.dueDate),
          gte(tasks.dueDate, now),
          lte(tasks.dueDate, threeDaysFromNow)
        )
      );

    const upcomingDueTasks = upcomingDueTasksResult[0]?.count || 0;

    // Get recent activity from tasks in user's projects
    const taskIds = userTasks.map(t => t.id);
    let recentActivity: any[] = [];
    
    if (taskIds.length > 0) {
      recentActivity = await db
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
        .where(inArray(activityLog.taskId, taskIds))
        .orderBy(desc(activityLog.createdAt))
        .limit(10);
    }

    return {
      totalTasks,
      tasksByStatus,
      tasksByPriority,
      overdueTasks,
      completedLast7Days,
      upcomingDueTasks,
      recentActivity,
    };
  }

  async updateUserProfile(userId: string, data: Partial<Pick<User, 'firstName' | 'lastName' | 'profileImageUrl'>>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async createTeam(data: InsertTeam & { createdById: string }): Promise<Team> {
    const [team] = await db.insert(teams).values(data).returning();
    return team;
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team;
  }

  async getTeamsByOrganization(organizationId: string): Promise<Team[]> {
    return await db
      .select()
      .from(teams)
      .where(eq(teams.organizationId, organizationId))
      .orderBy(desc(teams.createdAt));
  }

  async updateTeam(id: string, data: Partial<InsertTeam>): Promise<Team | undefined> {
    const [updatedTeam] = await db
      .update(teams)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, id))
      .returning();
    return updatedTeam;
  }

  async deleteTeam(id: string): Promise<boolean> {
    const result = await db.delete(teams).where(eq(teams.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async addTeamMember(data: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values(data).returning();
    return member;
  }

  async removeTeamMember(teamId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    return await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(desc(teamMembers.createdAt));
  }

  async getUserTeams(userId: string): Promise<Team[]> {
    const userTeamMemberships = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));

    if (userTeamMemberships.length === 0) {
      return [];
    }

    const teamIds = userTeamMemberships.map(tm => tm.teamId);
    return await db
      .select()
      .from(teams)
      .where(inArray(teams.id, teamIds))
      .orderBy(desc(teams.createdAt));
  }

  async assignTeamToBoard(data: InsertBoardTeam): Promise<BoardTeam> {
    const [assignment] = await db.insert(boardTeams).values(data).returning();
    return assignment;
  }

  async removeTeamFromBoard(boardId: string, teamId: string): Promise<boolean> {
    const result = await db
      .delete(boardTeams)
      .where(and(eq(boardTeams.boardId, boardId), eq(boardTeams.teamId, teamId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getBoardTeams(boardId: string): Promise<BoardTeam[]> {
    return await db
      .select()
      .from(boardTeams)
      .where(eq(boardTeams.boardId, boardId));
  }

  async updateBoardTeamPermission(boardId: string, teamId: string, permission: string): Promise<BoardTeam | undefined> {
    const [updated] = await db
      .update(boardTeams)
      .set({ permission })
      .where(and(eq(boardTeams.boardId, boardId), eq(boardTeams.teamId, teamId)))
      .returning();
    return updated;
  }

  async assignTeamToProject(data: InsertProjectTeam): Promise<ProjectTeam> {
    const [assignment] = await db.insert(projectTeams).values(data).returning();
    return assignment;
  }

  async removeTeamFromProject(projectId: string, teamId: string): Promise<boolean> {
    const result = await db
      .delete(projectTeams)
      .where(and(eq(projectTeams.projectId, projectId), eq(projectTeams.teamId, teamId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getProjectTeams(projectId: string): Promise<ProjectTeam[]> {
    return await db
      .select()
      .from(projectTeams)
      .where(eq(projectTeams.projectId, projectId));
  }

  async updateProjectTeamPermission(projectId: string, teamId: string, permission: string): Promise<ProjectTeam | undefined> {
    const [updated] = await db
      .update(projectTeams)
      .set({ permission })
      .where(and(eq(projectTeams.projectId, projectId), eq(projectTeams.teamId, teamId)))
      .returning();
    return updated;
  }

  async createInvitation(data: InsertInvitation & { invitedById: string }): Promise<Invitation> {
    const [invitation] = await db.insert(invitations).values(data).returning();
    return invitation;
  }

  async getInvitation(id: string): Promise<Invitation | undefined> {
    const [invitation] = await db.select().from(invitations).where(eq(invitations.id, id));
    return invitation;
  }

  async getOrganizationInvitations(organizationId: string): Promise<Invitation[]> {
    return await db
      .select()
      .from(invitations)
      .where(eq(invitations.organizationId, organizationId))
      .orderBy(desc(invitations.createdAt));
  }

  async updateInvitationStatus(id: string, status: string): Promise<Invitation | undefined> {
    const [updated] = await db
      .update(invitations)
      .set({ status })
      .where(eq(invitations.id, id))
      .returning();
    return updated;
  }

  async deleteInvitation(id: string): Promise<boolean> {
    const result = await db.delete(invitations).where(eq(invitations.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getUsersWithBoardAccess(boardId: string): Promise<User[]> {
    const board = await db.select().from(boards).where(eq(boards.id, boardId)).limit(1);
    if (!board || board.length === 0) {
      return [];
    }

    const projectId = board[0].projectId;

    const projectMembersResult = await db
      .select({ userId: organizationMembers.userId })
      .from(projects)
      .innerJoin(organizationMembers, eq(projects.organizationId, organizationMembers.organizationId))
      .where(eq(projects.id, projectId));

    const boardTeamsResult = await db
      .select({ teamId: boardTeams.teamId })
      .from(boardTeams)
      .where(eq(boardTeams.boardId, boardId));

    const teamIds = boardTeamsResult.map(bt => bt.teamId);
    let teamMembersUserIds: string[] = [];

    if (teamIds.length > 0) {
      const teamMembersResult = await db
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(inArray(teamMembers.teamId, teamIds));
      
      teamMembersUserIds = teamMembersResult.map(tm => tm.userId);
    }

    const allUserIds = Array.from(new Set([
      ...projectMembersResult.map(pm => pm.userId),
      ...teamMembersUserIds,
    ]));

    if (allUserIds.length === 0) {
      return [];
    }

    return await db
      .select()
      .from(users)
      .where(inArray(users.id, allUserIds))
      .orderBy(users.firstName, users.lastName);
  }
}

export const storage = new DatabaseStorage();
