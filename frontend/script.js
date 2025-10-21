// script.js
// Toast Manager
class ToastManager {
    static showToast(message, type = 'info') {
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${this.getIcon(type)} ${message}</span>`;
        document.body.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 3000);
    }

    static getIcon(type) {
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        return icons[type] || '📄';
    }
}

// File Uploader
class FileUploader {
    /*constructor() {
        this.uploadedFiles = [];
        this.processedResults = []; // simpan ringkasan
        this.init();
    }*/
    constructor() {
        this.uploadedFiles = [];
        this.processedResults = [];
        this.currentProcessingIndex = 0;
        this.totalFilesToProcess = 0;
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
        this.updateProcessButton();
    }

    setupEventListeners() {
        this.browseButton.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
            this.fileInput.value = '';
        });

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

        this.processBtn.addEventListener('click', () => this.processFiles());
        this.clearBtn.addEventListener('click', () => this.clearAllFiles());
    }

    handleFiles(files) {
        let added = 0;
        for (let file of files) {
            if (this.validateFile(file)) {
                this.addFileToQueue(file);
                added++;
            }
        }
        if (added > 0) ToastManager.showToast(`${added} file ditambahkan`, 'success');
    }

    validateFile(file) {
        if (!file.type.includes('pdf')) {
            ToastManager.showToast('Hanya file PDF yang diperbolehkan!', 'error');
            return false;
        }
        if (this.uploadedFiles.some(f => f.file.name === file.name)) {
            ToastManager.showToast(`File "${file.name}" sudah ada!`, 'warning');
            return false;
        }
        return true;
    }

    addFileToQueue(file) {
        const id = Date.now().toString();
        const fileItem = { id, file, status: 'uploading' };
        this.uploadedFiles.push(fileItem);
        this.renderFileItem(fileItem);
        setTimeout(() => {
            this.updateFileStatus(id, 'completed');
        }, 800);
    }

    renderFileItem(fileItem) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.id = `file-${fileItem.id}`;
        div.innerHTML = `
            <div class="file-info">
                <div class="file-icon">📄</div>
                <div class="file-details">
                    <h4>${fileItem.file.name}</h4>
                    <span>${(fileItem.file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
            </div>
            <div class="file-status">
                <span class="status-text">Mengupload...</span>
            </div>
        `;
        this.uploadList.appendChild(div);
        this.updateProcessButton();
    }

    updateFileStatus(id, status) {
        const file = this.uploadedFiles.find(f => f.id === id);
        if (file) {
            file.status = status;
            document.querySelector(`#file-${id} .status-text`).textContent =
                status === 'completed' ? '✅ Selesai' : '❌ Error';
        }
        this.updateProcessButton();
    }

    updateProcessButton() {
        this.processBtn.disabled = !this.uploadedFiles.every(f => f.status === 'completed');
    }

    updateEmptyState() {
        this.uploadList.classList.toggle('empty', this.uploadedFiles.length === 0);
    }

    clearAllFiles() {
        this.uploadedFiles = [];
        this.uploadList.innerHTML = '';
        this.updateProcessButton();
        ToastManager.showToast('Daftar file dibersihkan', 'info');
    }

    /*async processFiles() {
        this.processBtn.disabled = true;
        this.processBtn.textContent = '⏳ Memproses...';
        this.processedResults = [];

        for (const fileItem of this.uploadedFiles) {
            const result = await this.sendToBackend(fileItem.file);
            this.processedResults.push(result);
        }

        sessionStorage.setItem('docuSumResults', JSON.stringify(this.processedResults));
        window.location.href = "result.html";
    }*/
    async processFiles() {
        this.processBtn.disabled = true;
        this.currentProcessingIndex = 0;
        this.totalFilesToProcess = this.uploadedFiles.length;
        this.processedResults = [];

        // Update button dengan progress indicator
        this.processBtn.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                <div class="progress-circle"></div>
                <span>Memproses... 0%</span>
            </div>
        `;

        // Tambah progress container di upload list
        this.createProgressContainer();

        for (const fileItem of this.uploadedFiles) {
            const result = await this.sendToBackend(fileItem.file);
            this.processedResults.push(result);
            
            // Update progress
            this.currentProcessingIndex++;
            this.updateProgress();
        }
        sessionStorage.setItem('docuSumResults', JSON.stringify(this.processedResults));
        window.location.href = "result.html";
    }

    createProgressContainer() {
        // Hapus progress container jika sudah ada
        const existingProgress = document.getElementById('progressContainer');
        if (existingProgress) existingProgress.remove();

        const progressContainer = document.createElement('div');
        progressContainer.id = 'progressContainer';
        progressContainer.className = 'progress-container';
        progressContainer.innerHTML = `
            <div class="progress-text">0%</div>
            <div class="progress-bar-container">
                <div class="progress-bar" id="progressBar"></div>
            </div>
        `;

        // Tambah progress di atas file list
        this.uploadList.parentNode.insertBefore(progressContainer, this.uploadList);
    }

    updateProgress() {
        const progress = Math.round((this.currentProcessingIndex / this.totalFilesToProcess) * 100);
        
        // Update progress text
        const progressText = document.querySelector('.progress-text');
        if (progressText) {
            progressText.textContent = `${progress}%`;
        }

        // Update progress bar
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }

        // Update button text
        this.processBtn.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                <div class="progress-circle"></div>
                <span>Memproses... ${progress}%</span>
            </div>
        `;

        // Update individual file status
        this.updateFileProgressStatus(this.currentProcessingIndex - 1, progress);
    }

    updateFileProgressStatus(fileIndex, overallProgress) {
        const fileItems = document.querySelectorAll('.file-item');
        if (fileItems[fileIndex]) {
            const statusElement = fileItems[fileIndex].querySelector('.status-text');
            if (statusElement) {
                if (overallProgress < 100) {
                    statusElement.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <div class="uploading-animation" style="width: 12px; height: 12px;"></div>
                            <span>Processing... ${overallProgress}%</span>
                        </div>
                    `;
                } else {
                    statusElement.innerHTML = '✅ Selesai diproses';
                }
            }
        }
    }

    /*async sendToBackend(file) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("http://127.0.0.1:8000/api/upload", {
            method: "POST",
            body: formData
        });

        const result = await response.json();

        return {
            file: result?.data?.file || file.name,
            sections: result?.data?.sections || [],
            download_pdf: result?.download_pdf || null,
            download_docx: result?.download_docx || null
        };
    }*/
    async sendToBackend(file) {
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch("http://127.0.0.1:8000/api/upload", {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            return {
                file: result?.data?.file || file.name,
                sections: result?.data?.sections || [],
                download_pdf: result?.download_pdf || null,
                download_docx: result?.download_docx || null
            };
        } catch (error) {
            console.error('Upload error:', error);
            ToastManager.showToast(`Gagal memproses ${file.name}`, 'error');
            return {
                file: file.name,
                sections: [],
                download_pdf: null,
                download_docx: null
            };
        }
    }
}

document.addEventListener('DOMContentLoaded', () => new FileUploader());

