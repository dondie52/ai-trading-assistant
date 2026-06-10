import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@trading/types";
import { readMfaGraceDays } from "./auth-provider.js";

export interface CreateProvisionedUserInput {
  readonly email: string;
  readonly password: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: UserRole;
  readonly provisionedBy: string;
}

export interface ProvisionedAuthUser {
  readonly id: string;
  readonly email: string;
}

@Injectable()
export class SupabaseAdminService {
  private client?: SupabaseClient;

  private getClient(): SupabaseClient {
    if (this.client) {
      return this.client;
    }

    const url = process.env.SUPABASE_URL?.trim();
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();

    if (!url || !serviceRoleKey) {
      throw new ServiceUnavailableException({
        code: "SUPABASE_ADMIN_NOT_CONFIGURED",
        message: "Supabase admin credentials are not configured."
      });
    }

    this.client = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    return this.client;
  }

  async createProvisionedUser(input: CreateProvisionedUserInput): Promise<ProvisionedAuthUser> {
    const graceUntil = new Date(Date.now() + readMfaGraceDays() * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.getClient().auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        first_name: input.firstName,
        last_name: input.lastName
      },
      app_metadata: {
        platform_role: input.role,
        provisioned_by: input.provisionedBy,
        must_change_password: true,
        mfa_grace_until: graceUntil
      }
    });

    if (error || !data.user) {
      throw new ServiceUnavailableException({
        code: "SUPABASE_USER_CREATE_FAILED",
        message: error?.message ?? "Failed to create Supabase user."
      });
    }

    return {
      id: data.user.id,
      email: data.user.email ?? input.email
    };
  }

  async updateUserPassword(userId: string, password: string): Promise<void> {
    const { error } = await this.getClient().auth.admin.updateUserById(userId, {
      password,
      app_metadata: {
        must_change_password: true
      }
    });
    if (error) {
      throw new ServiceUnavailableException({
        code: "SUPABASE_PASSWORD_UPDATE_FAILED",
        message: error.message
      });
    }
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const { error } = await this.getClient().auth.admin.signOut(userId, "global");
    if (error) {
      throw new ServiceUnavailableException({
        code: "SUPABASE_SESSION_REVOKE_FAILED",
        message: error.message
      });
    }
  }
}
