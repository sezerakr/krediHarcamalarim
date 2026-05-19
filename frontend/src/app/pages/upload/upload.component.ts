import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { BankName, BANKS } from '../../models/bank.model';
import { UploadSummary } from '../../models/statement.model';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-upload',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CurrencyPipe],
  templateUrl: './upload.component.html',
  styleUrl: './upload.component.scss'
})
export class UploadComponent {
  private http = inject(HttpClient);
  private router = inject(Router);

  BANKS = BANKS;
  
  selectedBank = signal<BankName>(BANKS.ZIRAAT);
  selectedFiles = signal<File[]>([]);
  isDragging = signal(false);
  uploading = signal(false);
  uploadProgress = signal(0);
  errorMsg = signal<string | null>(null);
  summaries = signal<UploadSummary[]>([]);

  onDragOver(e: DragEvent) { e.preventDefault(); this.isDragging.set(true); }
  onDragLeave(e: DragEvent) { e.preventDefault(); this.isDragging.set(false); }
  
  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragging.set(false);
    if (e.dataTransfer?.files.length) {
      this.handleFiles(e.dataTransfer.files);
    }
  }

  onFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
      this.handleFiles(input.files);
    }
  }

  private handleFiles(files: FileList | File[]) {
    this.errorMsg.set(null);
    this.summaries.set([]);
    
    const current = this.selectedFiles();
    const newFiles = Array.from(files).filter(f => !current.find(c => c.name === f.name));
    this.selectedFiles.set([...current, ...newFiles]);
  }

  removeFile(index: number) {
    const arr = [...this.selectedFiles()];
    arr.splice(index, 1);
    this.selectedFiles.set(arr);
  }

  async upload() {
    const files = this.selectedFiles();
    if (!files.length) return;

    this.uploading.set(true);
    this.errorMsg.set(null);
    this.summaries.set([]);
    this.uploadProgress.set(0);

    const uploadedSummaries: UploadSummary[] = [];

    // Upload sequentially to avoid overloading the AI/Backend
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bankName', this.selectedBank());

      try {
        const req = this.http.post<UploadSummary>('http://localhost:3000/api/statements/upload', formData);
        const res = await lastValueFrom(req);
        if (res) {
          uploadedSummaries.push(res);
        }
        this.uploadProgress.set(Math.round(((i + 1) / files.length) * 100));
      } catch (err: any) {
        this.errorMsg.set(`${file.name} yüklenirken hata: ` + (err?.error?.error ?? 'Bilinmeyen hata'));
        this.uploading.set(false);
        return; // Stop on first error
      }
    }

    this.summaries.set(uploadedSummaries);
    this.uploading.set(false);
    this.selectedFiles.set([]);
  }

  goToStatement(id: number) {
    this.router.navigate(['/statements', id]);
  }
}
