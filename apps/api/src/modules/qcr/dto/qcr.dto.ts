import { Allow, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class EarlyReleaseDto {
  /** From the Early Release Reason master (FR-107). */
  @IsString() @IsNotEmpty() reason: string;
}

export class UploadQcrDto {
  @IsUUID() documentId: string; // uploaded via POST /documents (kind=qcr)
  @IsOptional() @IsString() earlyReleaseReason?: string;
}

export class SetQcrRowDto {
  @IsIn(['premium', 'sumInsured', 'validityDate', 'termsNote']) field:
    'premium' | 'sumInsured' | 'validityDate' | 'termsNote';
  /** Checked per field by the service (row-values.ts). @Allow keeps it through the whitelisting ValidationPipe. */
  @Allow() value: string | number | null;
}

export class RowsCheckedDto {
  @IsBoolean() checked: boolean;
}

export class ReleaseQcrDto {
  @IsOptional() @IsString() coverNote?: string; // manual tickets (mail to RM)
}
