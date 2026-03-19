import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class DocEmbedding {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text', nullable: false })
  source!: string;

  @Column({ type: 'integer', nullable: false })
  chunkIndex!: number;

  @Column({ type: 'text', nullable: false })
  content!: string;

  @Column({ type: 'simple-json', nullable: false })
  embedding!: number[];

  @UpdateDateColumn()
  updatedAt!: Date;
}
