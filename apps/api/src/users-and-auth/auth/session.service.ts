import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Session, User } from '@attraccess/database-entities';
import { randomBytes } from 'crypto';

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
  expiresIn?: number; // seconds
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly defaultExpirationHours = 24;
  private readonly maxExpirationHours = 168; // 7 days

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {}

  /**
   * Creates a new session for the given user
   * @param user The user to create a session for
   * @param metadata Optional session metadata (userAgent, ipAddress, expiresIn)
   * @returns The generated session token
   */
  async createSession(user: User, metadata?: SessionMetadata): Promise<string> {
    const token = this.generateSessionToken();
    const expiresIn = metadata?.expiresIn || this.defaultExpirationHours * 3600; // Convert hours to seconds
    
    // Ensure expiration doesn't exceed maximum allowed
    const maxExpirationSeconds = this.maxExpirationHours * 3600;
    const actualExpiresIn = Math.min(expiresIn, maxExpirationSeconds);
    
    const expiresAt = new Date(Date.now() + actualExpiresIn * 1000);

    const session = this.sessionRepository.create({
      token,
      userId: user.id,
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ipAddress || null,
      expiresAt,
    });

    await this.sessionRepository.save(session);
    
    this.logger.log(`Created session for user ${user.id} (${user.username}), expires at ${expiresAt.toISOString()}`);
    
    return token;
  }

  /**
   * Validates a session token and returns the associated user
   * @param token The session token to validate
   * @returns The user if the session is valid, null otherwise
   */
  async validateSession(token: string): Promise<User | null> {
    if (!token) {
      return null;
    }

    const session = await this.sessionRepository.findOne({
      where: { token },
      relations: ['user'],
    });

    if (!session) {
      return null;
    }

    // Check if session has expired
    if (session.expiresAt < new Date()) {
      // Clean up expired session
      await this.sessionRepository.remove(session);
      this.logger.debug(`Removed expired session for user ${session.userId}`);
      return null;
    }

    // Update last accessed time
    session.lastAccessedAt = new Date();
    await this.sessionRepository.save(session);

    return session.user;
  }

  /**
   * Refreshes a session by generating a new token
   * @param token The current session token
   * @returns The new session token if successful, null if the session doesn't exist or is expired
   */
  async refreshSession(token: string): Promise<string | null> {
    if (!token) {
      return null;
    }

    const session = await this.sessionRepository.findOne({
      where: { token },
      relations: ['user'],
    });

    if (!session) {
      return null;
    }

    // Check if session has expired
    if (session.expiresAt < new Date()) {
      await this.sessionRepository.remove(session);
      this.logger.debug(`Removed expired session during refresh for user ${session.userId}`);
      return null;
    }

    // Generate new token and extend expiration
    const newToken = this.generateSessionToken();
    const newExpiresAt = new Date(Date.now() + this.defaultExpirationHours * 3600 * 1000);

    session.token = newToken;
    session.expiresAt = newExpiresAt;
    session.lastAccessedAt = new Date();

    await this.sessionRepository.save(session);
    
    this.logger.log(`Refreshed session for user ${session.userId} (${session.user.username})`);
    
    return newToken;
  }

  /**
   * Revokes a specific session
   * @param token The session token to revoke
   */
  async revokeSession(token: string): Promise<void> {
    if (!token) {
      return;
    }

    const result = await this.sessionRepository.delete({ token });
    
    if (result.affected && result.affected > 0) {
      this.logger.log(`Revoked session with token: ${token.substring(0, 8)}...`);
    }
  }

  /**
   * Revokes all sessions for a specific user
   * @param userId The ID of the user whose sessions should be revoked
   */
  async revokeAllUserSessions(userId: number): Promise<void> {
    const result = await this.sessionRepository.delete({ userId });
    
    if (result.affected && result.affected > 0) {
      this.logger.log(`Revoked ${result.affected} sessions for user ${userId}`);
    }
  }

  /**
   * Cleans up expired sessions from the database
   * This method is automatically called every 6 hours via cron job
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    const result = await this.sessionRepository.delete({
      expiresAt: LessThan(now),
    });

    if (result.affected && result.affected > 0) {
      this.logger.log(`Cleaned up ${result.affected} expired sessions`);
    }
  }

  /**
   * Generates a cryptographically secure session token
   * @returns A base64url-encoded random token
   */
  private generateSessionToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Gets all active sessions for a user (for administrative purposes)
   * @param userId The ID of the user
   * @returns Array of active sessions
   */
  async getUserSessions(userId: number): Promise<Session[]> {
    return this.sessionRepository.find({
      where: { 
        userId,
        expiresAt: MoreThan(new Date()) // Only return non-expired sessions
      },
      order: { lastAccessedAt: 'DESC' },
    });
  }

  /**
   * Gets session statistics
   * @returns Object containing session statistics
   */
  async getSessionStats(): Promise<{
    totalActiveSessions: number;
    expiredSessions: number;
  }> {
    const now = new Date();
    
    const [totalActiveSessions, expiredSessions] = await Promise.all([
      this.sessionRepository.count({
        where: { expiresAt: MoreThan(now) },
      }),
      this.sessionRepository.count({
        where: { expiresAt: LessThan(now) },
      }),
    ]);

    return {
      totalActiveSessions,
      expiredSessions,
    };
  }
}