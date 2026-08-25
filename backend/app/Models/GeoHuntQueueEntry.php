<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GeoHuntQueueEntry extends Model
{
    public $timestamps = false;
    protected $primaryKey = 'user_id';
    public $incrementing = false;
    protected $fillable = ['user_id', 'joined_at', 'heartbeat_at'];

    protected function casts(): array
    {
        return ['joined_at' => 'datetime', 'heartbeat_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
