import { ResourceIntroduction, ResourceIntroductionHistoryItem } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { IntroductionPersistence, IntroductionSubject, NewIntroductionHistory } from './port';
/** The shared introduction/history tables have one implementation for both subject kinds. */
export class TypeormIntroductionPersistence extends IntroductionPersistence {
  constructor(private readonly manager: EntityManager) {
    super();
  }
  private subject(subject: IntroductionSubject) {
    return subject.kind === 'resource' ? { resource: { id: subject.id } } : { resourceGroup: { id: subject.id } };
  }
  async find(subject: IntroductionSubject, userId: number): Promise<ResourceIntroduction | null> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceIntroduction)
        .findOne({ where: { ...this.subject(subject), receiverUser: { id: userId } } }),
    );
  }
  async latest(introductionId: number): Promise<ResourceIntroductionHistoryItem | null> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceIntroductionHistoryItem)
        .findOne({ where: { introduction: { id: introductionId } }, order: { createdAt: 'DESC', id: 'DESC' } }),
    );
  }
  async list(subject: IntroductionSubject, includeGroups = false): Promise<ResourceIntroduction[]> {
    const inherited = subject.kind === 'resource' && includeGroups;
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceIntroduction)
        .find({
          where: inherited
            ? [this.subject(subject), { resourceGroup: { resources: { id: subject.id } } }]
            : this.subject(subject),
          relations: ['receiverUser', 'tutorUser', 'history', ...(inherited ? ['resourceGroup'] : [])],
          cache: false,
        }),
    );
  }
  async history(subject: IntroductionSubject, userId: number): Promise<ResourceIntroductionHistoryItem[]> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceIntroductionHistoryItem)
        .find({ where: { introduction: { ...this.subject(subject), receiverUser: { id: userId } } } }),
    );
  }
  async create(subject: IntroductionSubject, userId: number, tutorUserId?: number): Promise<ResourceIntroduction> {
    const repo = this.manager.getRepository(ResourceIntroduction);
    return toApplicationRecord(
      await repo.save(
        repo.create({
          ...this.subject(subject),
          receiverUser: { id: userId },
          ...(tutorUserId != null ? { tutorUser: { id: tutorUserId } } : {}),
        }),
      ),
    );
  }
  async setTutor(introductionId: number, tutorUserId: number): Promise<void> {
    await this.manager.getRepository(ResourceIntroduction).update(introductionId, { tutorUserId });
  }
  async appendHistory(data: NewIntroductionHistory): Promise<ResourceIntroductionHistoryItem> {
    const repo = this.manager.getRepository(ResourceIntroductionHistoryItem);
    return toApplicationRecord(
      await repo.save(
        repo.create({
          introduction: data.introduction,
          action: data.action,
          comment: data.comment,
          performedByUser: { id: data.performedByUserId },
        }),
      ),
    );
  }
}
