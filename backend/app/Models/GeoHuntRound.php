<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GeoHuntRound extends Model
{
    public $timestamps = false;
    protected $fillable = ['match_id', 'number', 'map_key', 'target_x', 'target_y', 'crop_x', 'crop_y', 'crop_size', 'multiplier', 'started_at', 'deadline_at', 'first_guess_at', 'resolved_at', 'reveal_until', 'damaged_user_id', 'damage'];

    protected function casts(): array
    {
        return ['number' => 'integer', 'target_x' => 'float', 'target_y' => 'float', 'crop_x' => 'integer', 'crop_y' => 'integer', 'crop_size' => 'integer', 'multiplier' => 'float', 'started_at' => 'datetime', 'deadline_at' => 'datetime', 'first_guess_at' => 'datetime', 'resolved_at' => 'datetime', 'reveal_until' => 'datetime', 'damage' => 'integer'];
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(GeoHuntMatch::class, 'match_id');
    }

    public function guesses(): HasMany
    {
        return $this->hasMany(GeoHuntGuess::class, 'round_id');
    }
}
