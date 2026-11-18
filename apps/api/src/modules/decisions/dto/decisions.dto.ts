import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CloseNoAppetiteDto {
  @IsString() @IsNotEmpty() reason: string; // FR-133
}

/** Manual tickets only (FR-269): Quote selected | No appetite | Lost. */
export class LogClientDecisionDto {
  @IsIn(['quote_selected', 'lost', 'no_appetite']) kind: 'quote_selected' | 'lost' | 'no_appetite';
  @IsOptional() @IsUUID() qcrRowId?: string; // required for quote_selected
  @IsOptional() @IsString() reason?: string; // required for lost / no_appetite
}

/** RFQ Version 2 (M11, FR-251): change note + a fresh source of every type the previous version had. */
export class NewRfqVersionDto {
  @IsString() @IsNotEmpty() changeNote: string;
  @IsOptional() @IsUUID() excelDocumentId?: string;
  @IsOptional() @Matches(/^https?:\/\//) linkUrl?: string;
}
