import { User } from '../../transport/models/user.dto';
import { mapResponse } from '../../transport/response-mapper';
import type { AuthenticatedUser } from '@attraccess/plugins-backend-sdk/v2';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSessionResponse {
  @ApiProperty({
    type: User,
    description: 'The user that has been logged in',
    example: {
      id: 1,
      username: 'testuser',
    },
  })
  user: User;

  @ApiProperty({
    type: String,
    description: 'The authentication token',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  })
  authToken: string;
}

export interface JwtPayload {
  sub: number;
  username: string;
  tokenId: string;
}

/** Session records may be plain objects. Never depend on an ORM prototype for privacy filtering. */
export function mapSessionUser(user: AuthenticatedUser): User {
  const projected = mapResponse(User, user);
  for (const key of ['effectivePermissions', 'authenticationMethod', 'apiTokenId', 'jwtTokenId'] as const) {
    if (Object.prototype.hasOwnProperty.call(user, key)) {
      Object.assign(projected, { [key]: user[key] });
    }
  }
  return projected;
}
