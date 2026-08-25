import { useRef, useState } from 'react';
import { CheckCircle2, Clock3, FileSpreadsheet, Info, RefreshCw, UploadCloud, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetDashboardQueryKey, getListInstructorsQueryKey, getListUploadsQueryKey, useListUploads, useUploadSource } from '@workspace/api-client-react';
import { PageIntro, EmptyState, QueryError, SkeletonBlock } from '@/components/ui-pieces';

const sources = [
  { key: 'Darwin', label: 'Darwin HRMS', detail: 'Employment master', color: 'bg-[#dce8f2] text-primary' },
  { key: 'TeachOS', label: 'TeachOS', detail: 'Deployment access', color: 'bg-[#dff0eb] text-[#287469]' },
  { key: 'Exit List', label: 'Exit List', detail: 'Separation tracker', color: 'bg-[#f6e4de] text-[#9b4434]' },
];

export default function UploadsPage() {
  const queryClient = useQueryClient();
  const uploadsQuery = useListUploads({ query: { queryKey: getListUploadsQueryKey() } });
  const uploadSource = useUploadSource();
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState('Darwin');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setSelectedFile(file);
    setFeedback(null);
  };
  const handleSubmit = async () => {
    if (!selectedFile) return;
    setFeedback(null);
    try {
      const rows = await parseSourceFile(selectedFile);
      uploadSource.mutate({ data: { source, filename: selectedFile.name, row_count: rows.length, rows } }, {
        onSuccess: () => {
          setFeedback('success');
          setSelectedFile(null);
          if (inputRef.current) inputRef.current.value = '';
          queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListInstructorsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        },
        onError: () => setFeedback('error'),
      });
    } catch {
      setFeedback('error');
    }
  };

  return <div className="mx-auto max-w-[1250px]">
    <PageIntro eyebrow="Source control / Replace and reconcile" title="Source uploads" description="Replace source snapshots when a new export lands. Every upload is recorded here so the team can trace what the register was built from." action={<button type="button" data-testid="button-refresh-uploads" onClick={() => queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() })} className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12px] font-bold text-foreground transition-colors hover:bg-secondary lg:self-auto"><RefreshCw size={14} /> Refresh history</button>} />

    <div className="grid gap-5 lg:grid-cols-[.88fr_1.12fr]">
      <section className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
        <div className="flex items-start justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Replace snapshot</p><h2 className="mt-1 text-[18px] font-extrabold tracking-[-0.03em]">Bring in a source file</h2></div><UploadCloud size={19} className="text-primary" /></div>
        <p className="mt-2 text-[12px] leading-5 text-muted-foreground">Each upload replaces that source’s current snapshot and reconciles names against the live register.</p>
        <div className="mt-6 space-y-2">
          {sources.map((item) => <button type="button" key={item.key} data-testid={`button-source-${item.key.toLowerCase().replace(' ', '-')}`} onClick={() => setSource(item.key)} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all ${source === item.key ? 'border-primary bg-[#f0f4f7] shadow-sm' : 'border-border hover:bg-secondary'}`}><span className={`grid h-9 w-9 place-items-center rounded-lg ${item.color}`}><FileSpreadsheet size={17} /></span><span className="flex-1"><span className="block text-[12px] font-bold">{item.label}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{item.detail}</span></span><span className={`h-4 w-4 rounded-full border-2 ${source === item.key ? 'border-primary bg-primary shadow-[inset_0_0_0_3px_hsl(var(--card))]' : 'border-border'}`} /></button>)}
        </div>
        <div className="mt-6">
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={(event) => handleFile(event.target.files?.[0])} data-testid="input-source-file" className="sr-only" />
          {!selectedFile ? <button type="button" data-testid="button-choose-source-file" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files?.[0]); }} className="flex min-h-[124px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-[#b7c8d5] bg-[#f5f8fa] px-4 text-center transition-colors hover:border-primary hover:bg-[#edf3f6]"><UploadCloud size={22} className="text-primary" /><span className="mt-2 text-[12px] font-bold">Choose CSV or Excel file</span><span className="mt-1 text-[11px] text-muted-foreground">Drop a file here, or browse from your computer</span></button> : <div className="flex min-h-[124px] items-center gap-3 rounded-lg border border-[#b7c8d5] bg-[#f5f8fa] p-4"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#dce8f2] text-primary"><FileSpreadsheet size={19} /></span><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-bold">{selectedFile.name}</p><p className="font-mono-ui mt-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{formatBytes(selectedFile.size)} · Ready to reconcile</p></div><button type="button" aria-label="Remove selected file" data-testid="button-remove-selected-file" onClick={() => { setSelectedFile(null); if (inputRef.current) inputRef.current.value = ''; }} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><X size={16} /></button></div>}
        </div>
        <div className="mt-5 flex items-start gap-2 rounded-lg bg-[#fff7db] p-3 text-[11px] leading-5 text-[#79601a]"><Info size={15} className="mt-0.5 shrink-0" /><span>Use the source export as-is. The first row is treated as a header when counting records.</span></div>
        {feedback === 'success' && <p data-testid="status-upload-success" className="mt-4 flex items-center gap-2 rounded-lg bg-[#e5f3ed] px-3 py-2 text-[12px] font-semibold text-[#287469]"><CheckCircle2 size={15} /> Snapshot reconciled and recorded.</p>}
        {feedback === 'error' && <p data-testid="status-upload-error" className="mt-4 rounded-lg bg-[#fff0ec] px-3 py-2 text-[12px] font-semibold text-[#9b4434]">We could not parse or reconcile this file. Please check its headers and try again.</p>}
        <button type="button" disabled={!selectedFile || uploadSource.isPending} data-testid="button-record-upload" onClick={handleSubmit} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-[12px] font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45">{uploadSource.isPending ? 'Reconciling upload…' : `Reconcile ${source} snapshot`}</button>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
        <div className="mb-6 flex items-start justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Audit trail</p><h2 className="mt-1 text-[18px] font-extrabold tracking-[-0.03em]">Recent uploads</h2></div><Clock3 size={18} className="text-muted-foreground" /></div>
        {uploadsQuery.isLoading && <div className="space-y-3">{[1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-[62px]" />)}</div>}
        {uploadsQuery.isError && <QueryError message="Upload history is unavailable." />}
        {!uploadsQuery.isLoading && !uploadsQuery.isError && !(uploadsQuery.data?.length) && <EmptyState title="No source uploads yet" description="Your next Darwin, TeachOS, or Exit List snapshot will appear here." />}
        {!uploadsQuery.isLoading && !uploadsQuery.isError && !!uploadsQuery.data?.length && <div className="overflow-hidden rounded-lg border border-border"><div className="grid grid-cols-[1fr_auto] gap-4 bg-[#f4f7f9] px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><span>Source file</span><span>Rows</span></div>{uploadsQuery.data.map((upload) => <div key={upload.id} data-testid={`row-upload-${upload.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-border/70 px-4 py-3.5"><div className="flex min-w-0 items-center gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${sources.find((item) => item.key === upload.source)?.color || 'bg-secondary text-muted-foreground'}`}><FileSpreadsheet size={15} /></span><span className="min-w-0"><span data-testid={`text-upload-file-${upload.id}`} className="block truncate text-[12px] font-bold">{upload.filename}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{upload.source} · {formatDate(upload.uploaded_at)}</span></span></div><span data-testid={`text-upload-rows-${upload.id}`} className="font-mono-ui text-[11px] text-muted-foreground">{upload.row_count.toLocaleString('en-IN')}</span></div>)}</div>}
      </section>
    </div>
  </div>;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 KB';
  return `${(bytes / 1024).toFixed(bytes > 1024 * 1024 ? 1 : 0)} ${bytes > 1024 * 1024 ? 'MB' : 'KB'}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

type ParsedRow = Record<string, string>;

async function parseSourceFile(file: File): Promise<ParsedRow[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') return parseCsv(await file.text());
  if (extension === 'xlsx') return parseXlsx(await file.arrayBuffer());
  throw new Error('Unsupported file type');
}

function parseCsv(contents: string): ParsedRow[] {
  const records = contents.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine);
  const [headers, ...data] = records;
  if (!headers?.length) return [];
  return data.map((cells) => Object.fromEntries(headers.map((header, index) => [header.trim(), cells[index]?.trim() ?? '']))).filter((row) => Object.values(row).some(Boolean));
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { cells.push(cell); cell = ''; }
    else cell += character;
  }
  cells.push(cell);
  return cells;
}

async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedRow[]> {
  const entries = await unzipEntries(buffer);
  const shared = (entries['xl/sharedStrings.xml'] ? extractXmlTexts(entries['xl/sharedStrings.xml']) : []);
  const workbook = entries['xl/worksheets/sheet1.xml'];
  if (!workbook) throw new Error('Workbook has no first worksheet');
  const rowXml = [...workbook.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((match) => match[1]);
  const matrix = rowXml.map((row) => {
    const cells: string[] = [];
    for (const cell of row.matchAll(/<c[^>]*r="([A-Z]+)\d+"[^>]*?(?:t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g)) {
      const column = columnNumber(cell[1]);
      const raw = /<v[^>]*>([\s\S]*?)<\/v>/.exec(cell[3])?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(cell[3])?.[1] ?? '';
      cells[column] = cell[2] === 's' ? (shared[Number(raw)] ?? '') : decodeXml(raw);
    }
    return cells;
  });
  const [headers, ...data] = matrix;
  if (!headers?.length) return [];
  return data.map((cells) => Object.fromEntries(headers.map((header, index) => [header?.trim() ?? '', cells[index]?.trim() ?? '']).filter(([header]) => header))).filter((row) => Object.values(row).some(Boolean));
}

async function unzipEntries(buffer: ArrayBuffer): Promise<Record<string, string>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const entries: Record<string, string> = {};
  let offset = 0;
  while (offset + 30 <= view.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if (flags & 0x08) throw new Error('Workbook uses unsupported streaming compression');
    const name = decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    const compressed = bytes.slice(start, start + compressedSize);
    const output = method === 0 ? compressed : new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    entries[name] = decoder.decode(output);
    offset = start + compressedSize;
  }
  return entries;
}

function extractXmlTexts(xml: string) {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => decodeXml([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => item[1]).join('')));
}
function decodeXml(value: string) { return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))); }
function columnNumber(reference: string) { return [...reference].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1; }