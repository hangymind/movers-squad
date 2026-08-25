<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GeoHuntGuess extends Model
{
    public $timestamps = false;
    protected $fillable = ['round_id', 'user_id', 'x', 'y', 'distance_tiles', 'score', 'timed_out', 'submitted_at', 'damage_taken', 'hp_after'];

    protected function casts(): array
    {
        return ['x' => 'float', 'y' => 'float', 'distance_tiles' => 'float', 'score' => 'integer', 'timed_out' => 'boolean', 'submitted_at' => 'datetime', 'damage_taken' => 'integer', 'hp_after' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
