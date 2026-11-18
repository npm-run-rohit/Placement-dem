import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { BusinessType, RiskTier } from '@bimaplacement/contracts';

export class SetTargetPremiumDto {
  /** null/omitted removes the target (BR-108). */
  @IsOptional() @IsNumber() @Min(0) value?: number | null;
  @IsOptional() @IsString() note?: string;
}

export class SetRiskTierDto {
  @IsEnum(RiskTier) value: RiskTier;
}

export class CorrectBusinessTypeDto {
  @IsEnum(BusinessType) value: BusinessType;
  @IsString() @IsNotEmpty() reason: string;
}

export class ReassignDto {
  @IsUUID() ownerId: string;
  @IsString() @IsNotEmpty() reason: string; // FR-026
}
