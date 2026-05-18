import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BankName, BANKS } from '../../models/bank.model';
import { UploadSummary } from '../../models/statement.model';

@Component({
  selector: 'app-upload',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './upload.component.html',
  styleUrl: './upload.component.scss'
})
export class UploadComponent {
  private http = inject(HttpClient);
  private router = inject(Router);

  BANKS = BANKS;
  
  selectedBank = signal<BankName>(BANKS.ZIRAAT);
  selectedFile = signal<File | null>(null);
  isDragging = signal(false);
  uploading = signal(false);
  uploadProgress = signal(0);
  errorMsg = signal<string | null>(null);
  summary = signal<UploadSummary | null>(null);

  onDragOver(e: DragEvent) { e.preventDefault(); this.isDragging.set(true); }
  onDragLeave(e: DragEvent) { e.preventDefault(); this.isDragging.set(false); }
  
  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragging.set(false);
    if (e.dataTransfer?.files.length) {
      this.handleFile(e.dataTransfer.files[0]);
    }
  }

  onFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
      this.handleFile(input.files[0]);
    }
  }

  private handleFile(file: File) {
    this.errorMsg.set(null);
    this.summary.set(null);
    this.selectedFile.set(file);
  }

  upload() {
    const file = this.selectedFile();
    if (!file) return;

    this.uploading.set(true);
    this.errorMsg.set(null);
    this.summary.set(null);
    this.uploadProgress.set(0);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('bankName', this.selectedBank());

    this.http.post<UploadSummary>('http://localhost:3000/api/statements/upload', formData, {
      reportProgress: true,
      observe: 'events'
    }).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadProgress.set(Math.round(100 * event.loaded / event.total));
        } else if (event.type === HttpEventType.Response) {
          this.summary.set(event.body);
          this.uploading.set(false);
          this.selectedFile.set(null);
        }
      },
      error: (err) => {
        this.errorMsg.set(err?.error?.error ?? 'Dosya yüklenirken bir hata oluştu.');
        this.uploading.set(false);
        this.uploadProgress.set(0);
      }
    });
  }

  goToStatement(id: number) {
    this.router.navigate(['/statements', id]);
  }
}
