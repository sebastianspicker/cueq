/** Private uploads are bounded; downloads never expose object-store paths or keys. */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UploadDocumentVersionQuerySchema } from '@cueq/contracts';
import type { Request, Response } from 'express';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { ParseCuidPipe } from '../../platform/http/validation/parse-cuid.pipe.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import { PrismaService } from '../../persistence/prisma.service.js';
import { PersonHelper } from '../people/public.js';
import { DocumentCommandsService } from './document-commands.service.js';
import { DocumentQueryService } from './document-query.service.js';
import { assertDocumentScope } from './document-scope.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
async function readUpload(request: Request) {
  const chunks: Buffer[] = [];
  let size = 0;
  if (Number(request.headers['content-length']) > MAX_UPLOAD_BYTES) {
    request.resume();
    throw new PayloadTooLargeException('Document exceeds 10 MiB.');
  }
  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_UPLOAD_BYTES) throw new PayloadTooLargeException('Document exceeds 10 MiB.');
      chunks.push(bytes);
    }
  } catch (error) {
    request.resume();
    throw error;
  }
  return Buffer.concat(chunks, size);
}

@ApiTags('documents')
@ApiBearerAuth()
@Controller('v1/documents')
export class DocumentsController {
  constructor(
    @Inject(PersonHelper) private readonly people: PersonHelper,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DocumentQueryService) private readonly queries: DocumentQueryService,
    @Inject(DocumentCommandsService) private readonly commands: DocumentCommandsService,
  ) {}

  @Get()
  @Authenticated()
  async list(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.queries.list((await this.people.personForUser(user)).id, query);
  }

  @Post()
  @Authenticated()
  async create(@CurrentUser() user: AuthenticatedIdentity, @Body() body: unknown) {
    return this.commands.create((await this.people.personForUser(user)).id, body);
  }

  @Get(':id')
  @Authenticated()
  async detail(@CurrentUser() user: AuthenticatedIdentity, @Param('id', ParseCuidPipe) id: string) {
    return this.queries.detail((await this.people.personForUser(user)).id, id);
  }

  @Get(':id/versions')
  @Authenticated()
  async versions(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
    @Query() query: unknown,
  ) {
    return this.queries.versions((await this.people.personForUser(user)).id, id, query);
  }

  @Post(':id/versions')
  @Authenticated()
  @ApiConsumes('application/pdf', 'image/png', 'image/jpeg')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  async upload(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
    @Query() query: unknown,
    @Req() request: Request,
  ) {
    const actor = await this.people.personForUser(user);
    await assertDocumentScope(this.prisma, actor.id, 'documents.manage', id);
    const parsed = parseRequest(UploadDocumentVersionQuerySchema, query);
    const contentType = request.headers['content-type'] ?? '';
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(contentType))
      throw new BadRequestException('Upload a PDF, PNG or JPEG with its exact Content-Type.');
    return this.commands.upload(
      actor.id,
      id,
      parsed.expectedVersion,
      await readUpload(request),
      contentType,
    );
  }

  @Get(':id/versions/:versionId/content')
  @Authenticated()
  async download(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
    @Param('versionId', ParseCuidPipe) versionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.commands.download(
      (await this.people.personForUser(user)).id,
      id,
      versionId,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(result.content, {
      type: result.mimeType,
      disposition: `attachment; filename="${result.fileName}"`,
      length: result.content.length,
    });
  }

  @Post(':id/versions/:versionId/acknowledgements')
  @Authenticated()
  async acknowledge(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
    @Param('versionId', ParseCuidPipe) versionId: string,
  ) {
    return this.commands.acknowledge((await this.people.personForUser(user)).id, id, versionId);
  }
}
