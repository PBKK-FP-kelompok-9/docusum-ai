// script.js
// Toast Manager
class ToastManager {
    static showToast(message, type = 'info') {
        // Hapus toast sebelumnya
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }

        // Buat toast baru
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${this.getIcon(type)} ${message}</span>`;
        document.body.appendChild(toast);

        // Auto-remove setelah 3 detik
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 3000);
    }

    static getIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⏳',
            info: '💡'
        };
        return icons[type] || '📄';
    }
}

// File Uploader
class FileUploader {
    constructor() {
        this.uploadedFiles = [];
        this.init();
    }

    init() {
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.browseButton = document.getElementById('browseButton');
        this.uploadList = document.getElementById('uploadList');
        this.processBtn = document.getElementById('processBtn');
        this.clearBtn = document.getElementById('clearBtn');

        this.setupEventListeners();
        this.updateEmptyState();
    }

    setupEventListeners() {
        // Browse button click
        this.browseButton.addEventListener('click', () => {
            this.fileInput.click();
        });

        // File input change
        this.fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
            this.fileInput.value = ''; // Reset input
        });

        // Drag and drop
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });

        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });

        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });

        // Buttons
        this.processBtn.addEventListener('click', () => this.processFiles());
        this.clearBtn.addEventListener('click', () => this.clearAllFiles());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'u') {
                e.preventDefault();
                this.fileInput.click();
            }
        });
    }

    handleFiles(files) {
        let validFilesCount = 0;
        for (let file of files) {
            if (this.validateFile(file)) {
                this.addFileToQueue(file);
                validFilesCount++;
            }
        }
        if (validFilesCount > 0) {
            ToastManager.showToast(`Berhasil menambahkan ${validFilesCount} file`, 'success');
        }
    }

    validateFile(file) {
        if (!file.type.includes('pdf')) {
            ToastManager.showToast('Hanya file PDF yang diperbolehkan!', 'error');
            return false;
        }
        if (file.size > 10 * 1024 * 1024) {
            ToastManager.showToast(`File "${file.name}" terlalu besar! Maksimal 10MB.`, 'error');
            return false;
        }
        if (this.uploadedFiles.some(f => f.file.name === file.name)) {
            ToastManager.showToast(`File "${file.name}" sudah ada dalam daftar!`, 'warning');
            return false;
        }
        return true;
    }

    addFileToQueue(file) {
        const fileId = Date.now().toString();
        const fileItem = { id: fileId, file, status: 'uploading', progress: 0 };
        this.uploadedFiles.push(fileItem);
        this.renderFileItem(fileItem);
        this.simulateUpload(fileItem);
        this.updateEmptyState();
    }

    renderFileItem(fileItem) {
        const fileElement = document.createElement('div');
        fileElement.className = 'file-item';
        fileElement.id = `file-${fileItem.id}`;

        fileElement.innerHTML = `
            <div class="file-info">
                <div class="file-icon">📄</div>
                <div class="file-details">
                    <h4>${this.truncateFilename(fileItem.file.name)}</h4>
                    <span>${this.formatFileSize(fileItem.file.size)}</span>
                </div>
            </div>
            <div class="file-status ${fileItem.status}">
                ${fileItem.status === 'uploading' ? '<div class="uploading-animation"></div>' : ''}
                <span class="status-text">${this.getStatusText(fileItem)}</span>
            </div>
        `;
        this.uploadList.appendChild(fileElement);
        this.updateProcessButton();
    }

    truncateFilename(filename, maxLength = 30) {
        return filename.length <= maxLength ? filename : filename.substring(0, maxLength) + '...';
    }

    simulateUpload(fileItem) {
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                this.updateFileStatus(fileItem.id, 'completed');
                ToastManager.showToast(`"${fileItem.file.name}" berhasil diupload!`, 'success');
            }
            this.updateFileProgress(fileItem.id, progress);
        }, 200);
    }

    updateFileProgress(fileId, progress) {
        const fileElement = document.getElementById(`file-${fileId}`);
        if (fileElement) {
            const statusElement = fileElement.querySelector('.status-text');
            const fileItem = this.uploadedFiles.find(f => f.id === fileId);
            if (fileItem) {
                fileItem.progress = Math.min(progress, 100);
                statusElement.textContent = `${Math.round(fileItem.progress)}% • Mengupload...`;
            }
        }
    }

    updateFileStatus(fileId, status) {
        const fileItem = this.uploadedFiles.find(f => f.id === fileId);
        if (fileItem) {
            fileItem.status = status;
            const fileElement = document.getElementById(`file-${fileId}`);
            if (fileElement) {
                const statusElement = fileElement.querySelector('.status-text');
                statusElement.textContent = this.getStatusText(fileItem);
                statusElement.className = `status-text status-${status}`;
                const loadingAnim = fileElement.querySelector('.uploading-animation');
                if (loadingAnim && status === 'completed') {
                    loadingAnim.remove();
                }
            }
        }
        this.updateProcessButton();
    }

    getStatusText(fileItem) {
        switch (fileItem.status) {
            case 'uploading': return `${Math.round(fileItem.progress)}% • Mengupload...`;
            case 'completed': return 'Selesai ✅';
            case 'error': return 'Error ❌';
            default: return 'Menunggu...';
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    updateProcessButton() {
        const hasFiles = this.uploadedFiles.length > 0;
        const allCompleted = this.uploadedFiles.every(f => f.status === 'completed');
        this.processBtn.disabled = !hasFiles || !allCompleted;
        this.processBtn.textContent = allCompleted ?
            `✍️ Proses ${this.uploadedFiles.length} File` : 
            '⏳ Menunggu Upload Selesai';
    }

    updateEmptyState() {
        this.uploadList.classList.toggle('empty', this.uploadedFiles.length === 0);
    }

    clearAllFiles() {
        if (this.uploadedFiles.length === 0) {
            ToastManager.showToast('Tidak ada file untuk dibersihkan', 'info');
            return;
        }
        if (confirm(`Yakin ingin menghapus semua file (${this.uploadedFiles.length} file)?`)) {
            this.uploadedFiles = [];
            this.uploadList.innerHTML = '';
            this.updateProcessButton();
            this.updateEmptyState();
            ToastManager.showToast('Semua file berhasil dibersihkan', 'success');
        }
    }

    async processFiles() {
        if (this.uploadedFiles.length === 0) {
            ToastManager.showToast('Tidak ada file untuk diproses', 'warning');
            return;
        }
        this.showLoadingState(true);
        ToastManager.showToast(`Memproses ${this.uploadedFiles.length} file...`, 'info');
        try {
            for (const fileItem of this.uploadedFiles) {
                if (fileItem.status === 'completed') {
                    await this.sendToBackend(fileItem.file);
                }
            }
        } catch (error) {
            console.error('Error processing files:', error);
            ToastManager.showToast('Terjadi kesalahan saat memproses file', 'error');
        } finally {
            this.showLoadingState(false);
        }
    }

    showLoadingState(show) {
        if (show) {
            this.processBtn.innerHTML = '<div class="uploading-animation"></div> Memproses...';
            this.processBtn.disabled = true;
        } else {
            this.updateProcessButton();
        }
    }

    async sendToBackend(file) {
		const formData = new FormData();
		formData.append('file', file);

		try {
			ToastManager.showToast(`Mengirim "${file.name}" ke server...`, 'info');

			const response = await fetch('http://localhost:8000/api/upload', {
				method: 'POST',
				body: formData
        });

        if (!response.ok) throw new Error("Gagal proses file");

        const result = await response.json();

        if (result.download_pdf) {
            // langsung arahkan browser ke link download
            window.location.href = "http://localhost:8000" + result.download_pdf;
        }

        ToastManager.showToast(`"${file.name}" berhasil diproses! ✅`, 'success');

		} catch (error) {
        console.error('Upload error:', error);
        ToastManager.showToast(`Gagal memproses "${file.name}"`, 'error');
        throw error;
		}
	}
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new FileUploader();
    console.log('💡 Tips: Gunakan Ctrl+U untuk cepat membuka file dialog');
});