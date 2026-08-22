<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FlorrBindingApplication extends Model
{
    use HasFactory;

    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'user_id',
        'status',
        'screenshot_path',
        'screenshot_mime',
        'screenshot_size',
        'reviewed_by',
        'rejection_reason',
        'reviewed_at',
        'result_seen_at',
        'image_deleted_at',
    ];

    protected function casts(): array
    {
        return [
            'screenshot_size' => 'integer',
            'reviewed_at' => 'datetime',
            'result_seen_at' => 'datetime',
            'image_deleted_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
