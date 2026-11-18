import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Holiday list (Appendix C #16). Date in Asia/Kolkata. Retired (active=false), never deleted. */
@Entity('holidays')
export class Holiday {
  @PrimaryColumn({ type: 'date' })
  date: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
