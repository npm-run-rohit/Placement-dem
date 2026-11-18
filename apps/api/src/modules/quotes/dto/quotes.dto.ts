import { IsIn, IsNumber, IsOptional, IsString, Min, ValidateIf, IsNotEmpty } from 'class-validator';

export class DecideQuoteDto {
  @IsIn(['usable', 'clarification', 'excluded'])
  decision: 'usable' | 'clarification' | 'excluded';

  /** Required for excluded (FR-091); clarification text is mailed to the insurer. */
  @ValidateIf((o) => o.decision !== 'usable')
  @IsString()
  @IsNotEmpty()
  note?: string;
}

export class SetQuotePremiumDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  premium?: number | null;
}
