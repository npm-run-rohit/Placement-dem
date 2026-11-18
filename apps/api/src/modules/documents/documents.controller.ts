import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { DocumentKind, Role } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import type { AppConfig } from '../../config/configuration';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@Roles(Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly docs: DocumentsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Multipart upload (RFQ Excel, manual QCR, quote re-upload, mandate proof). */
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() u: AuthUser,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer },
    @Body() body: { ticketId?: string; kind: DocumentKind },
  ) {
    await this.docs.assertTicketVisible(u, body.ticketId);
    return this.docs.upload({
      ticketId: body.ticketId ?? null,
      kind: body.kind,
      fileName: file.originalname,
      contentType: file.mimetype,
      buffer: file.buffer,
      uploadedBy: u.id,
    });
  }

  @Get('ticket/:ticketId')
  list(@Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.docs.forTicket(ticketId);
  }

  @Get(':id/download-url')
  download(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Query('inline') inline?: string,
  ) {
    return this.docs.downloadUrl(u, id, inline === '1', req.ip ?? null);
  }

  /** Document access log (PLAN 4.5): Placement Head / Admin. */
  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Get(':id/access-log')
  accessLog(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.docs.accessLog(u, id);
  }

  /**
   * Dev storage only: serves the file behind a LocalStorageAdapter link. Resolved through the documents table
   * (never a raw path) with the visibility rule; the file name comes from the record, not the query string.
   */
  @Get('_local')
  async local(
    @CurrentUser() u: AuthUser,
    @Query('key') key: string,
    @Query('inline') inline: string | undefined,
    @Res() res: Response,
  ) {
    if (this.config.get('storage', { infer: true }).driver !== 'local') throw new NotFoundException();
    const { fileName, stream } = await this.docs.localFile(u, key ?? '');
    if (inline === '1' && fileName.toLowerCase().endsWith('.pdf'))
      res.setHeader('Content-Type', 'application/pdf');
    const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `${inline === '1' ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    stream.pipe(res);
  }
}
