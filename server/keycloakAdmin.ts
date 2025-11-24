import KcAdminClient from '@keycloak/keycloak-admin-client';

/**
 * Cliente de administración de Keycloak
 * Maneja la creación de grupos/roles por organización y asignación de usuarios
 */
class KeycloakAdminService {
  private client: KcAdminClient;
  private initialized = false;

  constructor() {
    this.client = new KcAdminClient({
      baseUrl: process.env.KEYCLOAK_URL!,
      realmName: process.env.KEYCLOAK_REALM!,
    });
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await this.client.auth({
        grantType: 'client_credentials',
        clientId: process.env.KEYCLOAK_CLIENT_ID!,
        clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      });

      this.initialized = true;
      console.log('[Keycloak Admin] Cliente inicializado correctamente');
    } catch (error) {
      console.error('[Keycloak Admin] Error al inicializar cliente:', error);
      throw error;
    }
  }

  /**
   * Crea un grupo en Keycloak para una organización
   * y sus roles correspondientes (owner, admin, member)
   */
  async createOrganizationGroup(organizationId: string, organizationName: string): Promise<string> {
    await this.initialize();

    try {
      // Crear grupo principal para la organización
      const groupName = `org-${organizationId}`;
      console.log(`[Keycloak Admin] Creando grupo para organización: ${groupName}`);

      const groupResponse = await this.client.groups.create({
        name: groupName,
        attributes: {
          organizationId: [organizationId],
          organizationName: [organizationName],
        },
      });

      const groupId = groupResponse.id;
      console.log(`[Keycloak Admin] Grupo creado con ID: ${groupId}`);

      // Crear subgrupos para roles (owner, admin, member)
      const roles = ['owner', 'admin', 'member'];
      
      for (const role of roles) {
        await this.client.groups.createChildGroup(
          { id: groupId },
          {
            name: role,
            attributes: {
              organizationId: [organizationId],
              role: [role],
            },
          }
        );
        console.log(`[Keycloak Admin] Subgrupo '${role}' creado para org ${organizationId}`);
      }

      return groupId;
    } catch (error) {
      console.error('[Keycloak Admin] Error al crear grupo de organización:', error);
      throw error;
    }
  }

  /**
   * Asigna un usuario a un rol específico dentro de una organización
   */
  async assignUserToOrganizationRole(
    userId: string,
    organizationId: string,
    role: 'owner' | 'admin' | 'member'
  ): Promise<void> {
    await this.initialize();

    try {
      // Buscar el grupo de la organización
      const groups = await this.client.groups.find({
        search: `org-${organizationId}`,
      });

      if (groups.length === 0) {
        throw new Error(`No se encontró grupo para organización ${organizationId}`);
      }

      const orgGroup = groups[0];

      // Buscar el subgrupo del rol
      const subgroups = await this.client.groups.listSubGroups({ parentId: orgGroup.id! });
      const roleGroup = subgroups.find(g => g.name === role);

      if (!roleGroup) {
        throw new Error(`No se encontró rol '${role}' para organización ${organizationId}`);
      }

      // Asignar usuario al grupo del rol
      await this.client.users.addToGroup({
        id: userId,
        groupId: roleGroup.id!,
      });

      console.log(`[Keycloak Admin] Usuario ${userId} asignado a rol '${role}' en org ${organizationId}`);
    } catch (error) {
      console.error('[Keycloak Admin] Error al asignar usuario a rol:', error);
      throw error;
    }
  }

  /**
   * Remueve un usuario de una organización
   */
  async removeUserFromOrganization(userId: string, organizationId: string): Promise<void> {
    await this.initialize();

    try {
      // Buscar el grupo de la organización
      const groups = await this.client.groups.find({
        search: `org-${organizationId}`,
      });

      if (groups.length === 0) {
        console.warn(`[Keycloak Admin] No se encontró grupo para organización ${organizationId}`);
        return;
      }

      const orgGroup = groups[0];

      // Obtener todos los subgrupos (roles)
      const subgroups = await this.client.groups.listSubGroups({ parentId: orgGroup.id! });

      // Remover usuario de todos los subgrupos de roles
      for (const subgroup of subgroups) {
        try {
          await this.client.users.delFromGroup({
            id: userId,
            groupId: subgroup.id!,
          });
          console.log(`[Keycloak Admin] Usuario ${userId} removido de grupo '${subgroup.name}'`);
        } catch (error) {
          // Ignorar si el usuario no está en el grupo
          console.debug(`[Keycloak Admin] Usuario no estaba en grupo ${subgroup.name}`);
        }
      }

      console.log(`[Keycloak Admin] Usuario ${userId} removido de organización ${organizationId}`);
    } catch (error) {
      console.error('[Keycloak Admin] Error al remover usuario de organización:', error);
      throw error;
    }
  }

  /**
   * Cambia el rol de un usuario dentro de una organización
   */
  async changeUserRole(
    userId: string,
    organizationId: string,
    newRole: 'owner' | 'admin' | 'member'
  ): Promise<void> {
    await this.initialize();

    try {
      // Primero remover de todos los roles actuales
      await this.removeUserFromOrganization(userId, organizationId);

      // Luego asignar al nuevo rol
      await this.assignUserToOrganizationRole(userId, organizationId, newRole);

      console.log(`[Keycloak Admin] Rol de usuario ${userId} cambiado a '${newRole}' en org ${organizationId}`);
    } catch (error) {
      console.error('[Keycloak Admin] Error al cambiar rol de usuario:', error);
      throw error;
    }
  }

  /**
   * Obtiene el rol de un usuario en una organización desde Keycloak
   */
  async getUserRoleInOrganization(
    userId: string,
    organizationId: string
  ): Promise<'owner' | 'admin' | 'member' | null> {
    await this.initialize();

    try {
      // Obtener grupos del usuario
      const userGroups = await this.client.users.listGroups({ id: userId });

      // Buscar grupos que pertenezcan a esta organización
      for (const group of userGroups) {
        const attributes = group.attributes;
        if (attributes?.organizationId?.[0] === organizationId && attributes?.role?.[0]) {
          return attributes.role[0] as 'owner' | 'admin' | 'member';
        }
      }

      return null;
    } catch (error) {
      console.error('[Keycloak Admin] Error al obtener rol de usuario:', error);
      return null;
    }
  }

  /**
   * Verifica si un usuario es owner o admin de al menos una organización
   * Usa Keycloak como fuente de verdad (más eficiente que iterar sobre todas las orgs)
   */
  async isAdminOfAnyOrganization(userId: string): Promise<boolean> {
    await this.initialize();

    try {
      // Obtener todos los grupos del usuario
      const userGroups = await this.client.users.listGroups({ id: userId });

      // Buscar grupos con atributo organizationId y role = owner o admin
      for (const group of userGroups) {
        const attributes = group.attributes;
        const role = attributes?.role?.[0];
        const hasOrgId = attributes?.organizationId?.[0];
        
        if (hasOrgId && (role === 'owner' || role === 'admin')) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('[Keycloak Admin] Error al verificar rol de admin:', error);
      return false;
    }
  }

  /**
   * Verifica si un usuario tiene permiso para crear organizaciones
   * Solo usuarios con el rol especial 'organization-creator' pueden crear orgs
   */
  async canCreateOrganizations(userId: string): Promise<boolean> {
    await this.initialize();

    try {
      console.log(`[Keycloak Admin] Verificando permiso de creación para usuario: ${userId}`);
      
      // Buscar si el usuario pertenece al grupo especial de creadores de organizaciones
      const userGroups = await this.client.users.listGroups({ id: userId });
      
      console.log(`[Keycloak Admin] Grupos del usuario ${userId}:`, userGroups.map(g => g.name));
      
      const hasCreatorRole = userGroups.some(
        group => group.name === 'organization-creators'
      );

      console.log(`[Keycloak Admin] Usuario ${userId} tiene permiso de creación: ${hasCreatorRole}`);
      return hasCreatorRole;
    } catch (error) {
      console.error('[Keycloak Admin] Error al verificar permiso de creación:', error);
      console.error('[Keycloak Admin] Error details:', error);
      return false;
    }
  }

  /**
   * Busca grupos en Keycloak por criterio de búsqueda
   */
  async findGroups(search: string): Promise<any[]> {
    await this.initialize();
    return this.client.groups.find({ search });
  }

  /**
   * Busca usuarios en Keycloak por email
   */
  async findUsersByEmail(email: string, exact: boolean = true): Promise<any[]> {
    await this.initialize();
    return this.client.users.find({ email, exact });
  }

  /**
   * Asigna permiso de creación de organizaciones a un usuario
   * IMPORTANTE: Solo debe llamarse manualmente para el primer usuario admin
   */
  async grantOrganizationCreatorPermission(userId: string): Promise<void> {
    await this.initialize();

    try {
      // Buscar o crear grupo de creadores de organizaciones
      let creatorGroups = await this.client.groups.find({
        search: 'organization-creators',
      });

      let creatorGroupId: string;

      if (creatorGroups.length === 0) {
        // Crear el grupo si no existe
        const groupResponse = await this.client.groups.create({
          name: 'organization-creators',
          attributes: {
            description: ['Usuarios con permiso para crear organizaciones'],
          },
        });
        creatorGroupId = groupResponse.id;
        console.log('[Keycloak Admin] Grupo organization-creators creado');
      } else {
        creatorGroupId = creatorGroups[0].id!;
      }

      // Asignar usuario al grupo
      await this.client.users.addToGroup({
        id: userId,
        groupId: creatorGroupId,
      });

      console.log(`[Keycloak Admin] Permiso de creación otorgado a usuario ${userId}`);
    } catch (error) {
      console.error('[Keycloak Admin] Error al otorgar permiso de creación:', error);
      throw error;
    }
  }

  /**
   * Lista todos los usuarios de Keycloak
   */
  async listAllUsers(): Promise<Array<{
    id: string;
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    enabled: boolean;
  }>> {
    await this.initialize();

    try {
      const users = await this.client.users.find({ max: 1000 });
      
      return users.map(user => ({
        id: user.id!,
        username: user.username || '',
        email: user.email || '',
        firstName: user.firstName,
        lastName: user.lastName,
        enabled: user.enabled ?? true,
      }));
    } catch (error) {
      console.error('[Keycloak Admin] Error al listar usuarios:', error);
      throw error;
    }
  }

  /**
   * Obtiene información detallada de un usuario de Keycloak por su ID
   */
  async getUserById(userId: string): Promise<{
    id: string;
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    enabled: boolean;
  } | null> {
    await this.initialize();

    try {
      const user = await this.client.users.findOne({ id: userId });
      
      if (!user) {
        return null;
      }

      return {
        id: user.id!,
        username: user.username || '',
        email: user.email || '',
        firstName: user.firstName,
        lastName: user.lastName,
        enabled: user.enabled ?? true,
      };
    } catch (error) {
      console.error('[Keycloak Admin] Error al obtener usuario:', error);
      return null;
    }
  }

  /**
   * Obtiene todos los miembros de una organización desde Keycloak
   */
  async getOrganizationMembers(organizationId: string): Promise<Array<{
    userId: string;
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: 'owner' | 'admin' | 'member';
  }>> {
    await this.initialize();

    try {
      // Buscar el grupo de la organización
      const groups = await this.client.groups.find({
        search: `org-${organizationId}`,
      });

      if (groups.length === 0) {
        console.warn(`[Keycloak Admin] No se encontró grupo para organización ${organizationId}`);
        return [];
      }

      const orgGroup = groups[0];
      const subgroups = await this.client.groups.listSubGroups({ parentId: orgGroup.id! });

      const members: Array<{
        userId: string;
        username: string;
        email: string;
        firstName?: string;
        lastName?: string;
        role: 'owner' | 'admin' | 'member';
      }> = [];

      // Obtener miembros de cada rol
      for (const subgroup of subgroups) {
        const role = subgroup.name as 'owner' | 'admin' | 'member';
        const groupMembers = await this.client.groups.listMembers({ id: subgroup.id! });

        for (const user of groupMembers) {
          members.push({
            userId: user.id!,
            username: user.username || '',
            email: user.email || '',
            firstName: user.firstName,
            lastName: user.lastName,
            role,
          });
        }
      }

      return members;
    } catch (error) {
      console.error('[Keycloak Admin] Error al obtener miembros de organización:', error);
      throw error;
    }
  }
}

export const keycloakAdmin = new KeycloakAdminService();
