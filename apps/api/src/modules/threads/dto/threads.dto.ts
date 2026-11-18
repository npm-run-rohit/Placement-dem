import { ArrayMinSize, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class TogglePanelEntityDto {
  @IsUUID() insurerId: string;
  @IsUUID() branchId: string;
  @IsBoolean() selected: boolean;
}

export class HoldForRmDto {
  @IsString() @IsNotEmpty() request: string;
}

export class ReplyToInsurerDto {
  @IsString() @IsNotEmpty() text: string;
}

export class RestartThreadsDto {
  @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true }) threadIds: string[];
  @IsString() @IsNotEmpty() reason: string; // FR-067, BR-044
}

export class LogCallDto {
  @IsString() @IsNotEmpty() outcome: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() nextFollowUpAt?: string;
}
