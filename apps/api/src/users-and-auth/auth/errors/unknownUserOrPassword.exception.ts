import { UnauthorizedException } from '@nestjs/common';

// One class for every password check (sign-in and the unverified email change), so an unknown account and a wrong
// password answer and audit identically. The misspelt message is a wire contract the frontend translates.
export class UnknownUserOrPasswordException extends UnauthorizedException {
  constructor() {
    super('UnkownUserOrPasswordException');
    this.name = 'UnknownUserOrPasswordException';
  }
}
