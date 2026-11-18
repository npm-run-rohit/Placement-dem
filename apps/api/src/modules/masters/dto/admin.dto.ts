import { IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { QuoteTargetScenario, TimingLob } from '@bimaplacement/contracts';

export class SlaTargetDto {
  @IsInt() @Min(1) @Max(540 * 30) targetMins: number;
  /** PRD wording for the target ("2 business hours per quote"); derived from the minutes when left out. */
  @IsOptional() @IsString() targetText?: string;
}

export class QuoteTargetDto {
  @IsEnum(TimingLob) timingLob: TimingLob;
  @IsEnum(QuoteTargetScenario) scenario: QuoteTargetScenario;
  @IsNumber() @Min(0.5) @Max(30) businessDays: number;
}

export class HolidayDto {
  @IsString() date: string;
  @IsString() name: string;
}

export class HolidayPatchDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class LookupDto {
  @IsString() value: string;
  @IsOptional() @IsString() description?: string;
}

export class LookupPatchDto {
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class TemplatePatchDto {
  @IsOptional() @IsString() subjectTemplate?: string;
  @IsOptional() @IsString() bodyTemplate?: string;
}

export class ProductTypePatchDto {
  @IsOptional() @IsArray() @IsString({ each: true }) aliases?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) bimasetuCodes?: string[];
  @IsOptional() @IsString() rfqTemplate?: string;
  @IsOptional() @IsEnum(TimingLob) timingLob?: TimingLob;
  @IsOptional() @IsBoolean() active?: boolean;
}
