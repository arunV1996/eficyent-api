<?php

namespace App\Rules;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Http\UploadedFile;

class DocumentFileOrBase64 implements ValidationRule
{
    private int $maxSize;
    private array $allowedMimes = [
        'image/jpeg',
        'image/png',
        'application/pdf',
        'image/jpg',
    ];

    public function __construct(int $maxSizeMB = 5)
    {
        $this->maxSize = $maxSizeMB * 1024 * 1024;
    }

    public function validate(string $attribute, mixed $value, \Closure $fail): void
    {
        if ($value instanceof UploadedFile) {

            if (! $value->isValid()) {
                $fail('Invalid uploaded file.');
                return;
            }

            if ($value->getSize() > $this->maxSize) {
                $fail('File size must not exceed 5MB.');
                return;
            }

            if (! in_array($value->getMimeType(), $this->allowedMimes)) {
                $fail('Only JPG, PNG and PDF files are allowed.');
            }

            return;
        }

        if (is_string($value) && str_contains($value, 'base64,')) {

            if (! preg_match('/^data:(.*?);base64,/', $value, $matches)) {
                $fail('Invalid base64 format.');
                return;
            }

            $mime = $matches[1];

            if (! in_array($mime, $this->allowedMimes)) {
                $fail('Only JPG, PNG and PDF files are allowed.');
                return;
            }

            $binary = base64_decode(substr($value, strpos($value, ',') + 1), true);

            if ($binary === false || strlen($binary) > $this->maxSize) {
                $fail('File size must not exceed 5MB.');
            }

            return;
        }

        $fail('Supporting document must be a file upload or base64 string.');
    }
}
