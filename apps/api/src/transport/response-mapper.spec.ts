import { ConversationListItemDto } from '../messaging/dtos/conversationListItem.dto';
import { ProjectWithAccessDto } from '../projects/dto/project-access.dto';
import 'reflect-metadata';
import { instanceToPlain } from 'class-transformer';
import * as sqliteModels from '@attraccess/database-entities';
import * as responseModels from './models';
import { ResourceUsage, User } from './models';
import { mapResponse, ResponseModel } from './response-mapper';
import { SchemaObjectFactory } from '@nestjs/swagger/dist/services/schema-object-factory';
import { ModelPropertiesAccessor } from '@nestjs/swagger/dist/services/model-properties-accessor';
import { SwaggerTypesMapper } from '@nestjs/swagger/dist/services/swagger-types-mapper';

describe('plain records at the response boundary', () => {
  it('projects nested records without copying credentials or unknown fields', () => {
    const createdAt = new Date('2026-09-01T12:30:00.000Z');
    const input = {
      id: 1,
      username: 'operator',
      email: 'private@example.test',
      passwordResetToken: 'reset-secret',
      authenticationDetails: [{ id: 2, type: 'local_password', password: 'password-hash', totpSecret: 'totp-secret' }],
      apiTokens: [{ id: 3, name: 'build', tokenHash: 'api-token-hash', permissionKeys: ['resources.read'], createdAt }],
      unreviewedInternalField: 'private',
    };
    const response = mapResponse(User, input);
    expect(response).toBeInstanceOf(User);
    expect(instanceToPlain(response)).toEqual({
      id: 1,
      username: 'operator',
      authenticationDetails: [{ id: 2, type: 'local_password' }],
      apiTokens: [{ id: 3, name: 'build', permissionKeys: ['resources.read'], createdAt }],
    });
    expect(input.passwordResetToken).toBe('reset-secret');
    expect(input.authenticationDetails[0].password).toBe('password-hash');
  });

  it('filters inbox participants and message senders after plain-record hydration', () => {
    const user = { id: 7, username: 'sender', email: 'private@example.test', passwordResetToken: 'secret' };
    const response = mapResponse(ConversationListItemDto, {
      id: 3,
      otherParticipant: user,
      otherParticipantOnline: true,
      unreadCount: 1,
      updatedAt: new Date('2026-10-01T10:00:00Z'),
      lastMessage: { id: 2, sender: user, content: 'Hello', internalData: 'private' },
    });
    expect(instanceToPlain(response)).toMatchObject({
      id: 3,
      otherParticipant: { id: 7, username: 'sender' },
      otherParticipantOnline: true,
      lastMessage: { id: 2, sender: { id: 7, username: 'sender' }, content: 'Hello' },
      unreadCount: 1,
    });
    expect(response.otherParticipant).not.toHaveProperty('email');
    expect(response.lastMessage.sender).not.toHaveProperty('passwordResetToken');
    expect(response.lastMessage).not.toHaveProperty('internalData');
  });

  it('preserves exact values, dates, nulls and absent relations', () => {
    const startTime = new Date('2026-10-01T10:00:00.000Z');
    const input = {
      id: 12,
      startTime,
      endTime: null,
      sessionDurationCreditsPerMinute: 9007199254740991,
      attributedOperatingDurationInMinutes: 0.125,
      meterRates: [{ meterId: 8, name: 'energy', creditsPerUnit: 123 }],
    };
    const response = mapResponse(ResourceUsage, input);
    expect(response.startTime).toBe(startTime);
    expect(response.endTime).toBeNull();
    expect(response.sessionDurationCreditsPerMinute).toBe(9007199254740991);
    expect(response.attributedOperatingDurationInMinutes).toBe(0.125);
    expect(response.meterRates).toEqual(input.meterRates);
    expect(response).not.toHaveProperty('resource');
    expect(mapResponse(ResourceUsage, null)).toBeNull();
    expect(mapResponse(ResourceUsage, undefined)).toBeUndefined();
  });

  it('uses a reviewed projection even when a related record refers back to its owner', () => {
    const user: { id: number; authenticationDetails: object[] } = { id: 1, authenticationDetails: [] };
    user.authenticationDetails.push({ id: 2, user, password: 'private' });
    const response = mapResponse(User, user);
    expect(response.authenticationDetails[0].user).toBe(response);
    expect(response.authenticationDetails[0]).not.toHaveProperty('password');
  });

  it('retains explicit project access metadata while filtering related users and extra fields', () => {
    const response = mapResponse(ProjectWithAccessDto, {
      id: 7,
      owner: { id: 1, username: 'owner', email: 'private@example.com' },
      access: { isOwner: true, role: null, canManageProject: true, internal: 'private' },
    });
    expect(response.access).toEqual({ isOwner: true, role: null, canManageProject: true });
    expect(response.owner).toEqual({ id: 1, username: 'owner' });
  });

  it('retains the Swagger schemas of the existing public models', () => {
    const schemaFactory = new SchemaObjectFactory(new ModelPropertiesAccessor(), new SwaggerTypesMapper());
    const existing = {};
    const replacement = {};
    const names: string[] = [];
    for (const [name, value] of Object.entries(responseModels)) {
      if (typeof value !== 'function' || !('responseFields' in value) || !(name in sqliteModels)) continue;
      const responseModel = value as ResponseModel;
      schemaFactory.exploreModelSchema(responseModel, replacement);
      schemaFactory.exploreModelSchema(Reflect.get(sqliteModels, name), existing);
      names.push(name);
    }
    expect(names).toContain('User');
    expect(names).toContain('ResourceUsage');
    expect(names).toContain('SSOProviderSAMLConfiguration');
    expect(replacement).toEqual(existing);
  });
});
