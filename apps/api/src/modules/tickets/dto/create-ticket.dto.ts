import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { BusinessType, ProductTypeCode, Urgency } from '@bimaplacement/contracts';

/**
 * Manual ticket (M1 3.3, FR-192..201). The RFQ Excel is uploaded first via POST /documents
 * (kind=rfq_excel) and referenced here; at least one of rfqExcelDocumentId / rfqLinkUrl.
 */
export class CreateManualTicketDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  rfqExcelDocumentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^https?:\/\//, { message: 'RFQ link must start with http:// or https://' })
  rfqLinkUrl?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  businessName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  industryType: string;

  @ApiProperty({ enum: ProductTypeCode })
  @IsEnum(ProductTypeCode)
  productType: ProductTypeCode;

  @ApiProperty({ enum: BusinessType })
  @IsEnum(BusinessType)
  businessType: BusinessType;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.businessType === BusinessType.RENEWAL)
  @IsDateString()
  renewalDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  incumbentInsurer?: string; // insurer id or free text

  @ApiProperty()
  @IsUUID()
  rmUserId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientSpoc?: string;

  @ApiPropertyOptional({ enum: Urgency })
  @IsOptional()
  @IsIn(Object.values(Urgency))
  urgency?: Urgency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetPremium?: number;

  /** Placement Head only (FR-198). Ignored for Placement Managers - creator owns the ticket. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}
