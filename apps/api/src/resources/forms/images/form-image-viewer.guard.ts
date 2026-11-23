import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DualAuthGuard } from '@attraccess/plugins-backend-sdk';

/**
 * Signs the viewer in like every other endpoint, but answers a request without a valid sign-in with 404, as it does
 * for a signed-in user who may not see the image: nobody can tell from the answer whether an image id exists.
 */
@Injectable()
export class FormImageViewerGuard implements CanActivate {
  constructor(private readonly signIn: DualAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await this.signIn.canActivate(context);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw new NotFoundException('Image not found');
      throw error;
    }
  }
}
