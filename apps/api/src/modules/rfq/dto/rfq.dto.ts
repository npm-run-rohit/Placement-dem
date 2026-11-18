import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class RaiseQueriesDto {
  /** New query lines; still-open queries are re-included automatically (BR-112). */
  @IsArray()
  @IsString({ each: true })
  newQueries: string[];

  /** Message body for the RM (manual tickets - mail). */
  @IsOptional()
  @IsString()
  message?: string;
}

export class RmReplyDto {
  @IsString()
  @IsNotEmpty()
  text: string;
}

export class NewRfqVersionDto {
  @IsString()
  @IsNotEmpty()
  changeNote: string;

  @IsOptional()
  @IsUUID()
  excelDocumentId?: string;

  @IsOptional()
  @Matches(/^https?:\/\//)
  linkUrl?: string;
}

export class ResolveQueriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  queryIds: string[];
}
