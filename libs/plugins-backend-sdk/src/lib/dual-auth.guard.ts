import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class DualAuthGuard extends AuthGuard('session') {
  private readonly logger = new Logger(DualAuthGuard.name);

  /**
   * Handles authentication requests using the session strategy
   * Supports both cookie and Authorization header authentication
   * Priority: Authorization header > Cookie
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const result = await super.canActivate(context);
      return result as boolean;
    } catch (error) {
      this.logger.debug(`Authentication failed: ${error.message}`);
      
      // Re-throw with consistent error message for both cookie and header failures
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException('Authentication required');
      }
      
      throw error;
    }
  }

  /**
   * Handles authentication errors with proper error messages
   */
  handleRequest<TUser = unknown>(
    err: unknown,
    user: unknown,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const request = context.switchToHttp().getRequest();
      const hasAuthHeader = request.headers.authorization?.startsWith('Bearer ');
      const hasCookie = request.cookies?.['auth-session'];
      
      let errorMessage = 'Authentication required';
      
      if (hasAuthHeader) {
        errorMessage = 'Invalid or expired authorization token';
      } else if (hasCookie) {
        errorMessage = 'Invalid or expired session cookie';
      }
      
      this.logger.debug(`Authentication failed: ${errorMessage}`);
      throw new UnauthorizedException(errorMessage);
    }
    
    return user as TUser;
  }
}