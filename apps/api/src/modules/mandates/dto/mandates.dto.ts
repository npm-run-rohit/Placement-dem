import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class RequestMandateDto {
  @IsString() @IsNotEmpty() reason: string; // Mandate Request Reason master
  @IsOptional() @IsUUID() preferredInsurerId?: string;
  @IsString() @IsNotEmpty() message: string;
}

export class NoteDto {
  @IsOptional() @IsString() note?: string;
}

/** RM reply recorded by Placement (mail) or received via BimaSetu (OPEN). */
export class MandateResponseDto {
  @IsIn(['considering', 'signed', 'declined']) kind: 'considering' | 'signed' | 'declined';
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() declineReason?: string; // required when declined (FR-279)
  @IsOptional() @IsString() reference?: string;
}

export class IncumbentMandateDto {
  @IsUUID() proofDocumentId: string; // POST /documents kind=mandate_proof
  @IsOptional() @IsString() reference?: string; // defaults to MND-<n>-A
}
