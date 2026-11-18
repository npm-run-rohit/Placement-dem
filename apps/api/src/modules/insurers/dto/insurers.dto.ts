import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { BranchStatus, InsurerStatus, ProductTypeCode } from '@bimaplacement/contracts';

export class InsurerFieldsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  sectors?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;

  /** Do Not Float / Inactive apply to every branch (FR-212). */
  @IsOptional()
  @IsEnum(InsurerStatus)
  status?: InsurerStatus;

  /** Per product type; shown as chips, never blocks selection (FR-210). */
  @IsOptional()
  @IsArray()
  @IsEnum(ProductTypeCode, { each: true })
  appetite?: ProductTypeCode[];

  @IsOptional()
  @IsString()
  brokingCode?: string | null;

  @IsOptional()
  @IsString()
  logoUrl?: string | null;
}

export class CreateInsurerDto extends InsurerFieldsDto {
  @IsString()
  @IsNotEmpty()
  declare name: string;

  /** short unique key, e.g. 'icici' (derived from the name when omitted) */
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/)
  code?: string;
}

export class PocDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  designation?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;
}

export class BranchDto {
  /** blank = the insurer as a whole */
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsEnum(BranchStatus)
  status?: BranchStatus;

  /**
   * POCs per product group, the full list for each group sent (routing key Insurer + Branch + Product Group, FR-162).
   * POCs missing from a sent group are retired (active = false), never deleted.
   */
  @IsOptional()
  @IsObject()
  pocs?: Partial<Record<'EB' | 'Liability' | 'P&C', PocDto[]>>;
}
