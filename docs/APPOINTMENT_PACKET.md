# Resident-controlled appointment packet

The appointment packet turns explicitly selected notice facts, questions, records and supporting files into a printable PDF. It is assembled locally by `src/infrastructure/appointment-packet.ts` using the typed snapshot in `src/domain/appointment-packet.ts`. It makes no network, AI or storage calls. Creating or downloading a packet does not submit paperwork or verify receipt, eligibility or acceptance.

## Integration

Call `createAppointmentPacketInput(workspace, options)` to select notices and convert existing continuity events into a snapshot. Set `noticeIds` for a subset; an empty array selects none. Set `includeSubmissionHistory: true` only after the resident chooses it. The adapter includes submitted, acknowledged and follow-up events for the selected notices; preparation events never become submission records. Attachments are excluded by default.

Call `await buildAppointmentPacket(input, attachments)` to receive a `Uint8Array`. Each attachment has `id`, `name`, `mimeType` and `bytes`. Supported MIME types are `application/pdf`, `image/png`, `image/jpeg` and UTF-8 `text/plain`. Only `input.selectedAttachmentIds` are resolved and read; missing or duplicated selections produce a clear error. Unselected files are ignored even when supplied by the caller.

The snapshot supports English or Spanish cover text, appointment location/date, an optional resident name, reviewed/unreviewed notice requests, original quotes and source lines, confirmed/unconfirmed dates, appointment questions, selected submission records and an explicit file manifest. Original case-specific wording remains in its source language. The generator does not translate, infer or invent notice facts.

## Official forms remain editable

Interactive or signed PDF forms cannot safely be combined by copying pages: that can discard their canonical AcroForm fields or invalidate signatures. Mark known official-form descriptors with `role: 'official-form'` (bytes are optional for these descriptors). Their names appear in the packet manifest with a clear separate editable-download instruction. Keep the existing full, unsigned official form download beside the packet download. Unknown attachments containing fields or widget annotations are rejected with the same explanation; they are never silently flattened.

Ordinary PDFs are appended as printable page copies. Executable page actions and annotations are excluded from these copies; original files remain unchanged. A divider identifies every copied file. Download originals separately when comments, links or interactive features need to be preserved.

## Typography and limits

Helvetica supports the reviewed English and Spanish Latin-script text. Paragraphs and unbroken reference strings wrap to the available width, and long sections continue on numbered pages. Unsupported glyphs fail clearly instead of disappearing. JPEG EXIF, IPTC and comment metadata are excluded while image pixels are retained. Output metadata contains only neutral Anchor labels and the selected creation date, never a resident name, case identifier or source-document metadata.

One packet supports up to 30 notices, 25 questions, 100 submission records and 16 selected files. Each file is limited to 20 MB, the total to 40 MB, individual supporting PDFs to 60 pages, text attachments to 40,000 characters and the completed packet to 100 pages. PNG dimensions are bounded before decoding; unreadable, encrypted, oversized or unsupported files fail with an actionable message. Saved originals are not modified on failure.

`tests/appointment-packet.test.mjs` checks selection isolation, source quotes, multilingual wrapping, contents numbering, UTF-8 appendices, neutral metadata, source-file preservation, form protection, page limits and annotation removal. Final release verification also renders a fictional packet for visual review.
