<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GeoHuntMatchPlayer extends Model
{
    public $timestamps = false;
    protected $fillable = ['match_id', 'user_id', 'seat', 'hp', 'heartbeat_at', 'forfeited_at', 'eliminated_at', 'placement', 'xp_awarded'];

    protected function casts(): array
    {
        return ['seat' => 'integer', 'hp' => 'integer', 'heartbeat_at' => 'datetime', 'forfeited_at' => 'datetime', 'eliminated_at' => 'datetime', 'placement' => 'integer', 'xp_awarded' => 'integer'];
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(GeoHuntMatch::class, 'match_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
