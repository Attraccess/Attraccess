import { UseGuards, applyDecorators } from '@nestjs/common';
import { CompanionAuthenticatedGuard } from './companion-authenticated.guard';

export const CompanionAuthenticated = () => applyDecorators(UseGuards(CompanionAuthenticatedGuard));
