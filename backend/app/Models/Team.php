<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Team extends Model
{
    use HasFactory;

    public const MAX_MEMBERS = 4;

    protected $fillable = ['game_name', 'note', 'owner_id', 'closed_at', 'assembled_at', 'min_level', 'excluded_florr_ids', 'max_members'];

    protected function casts(): array
    {
        return ['closed_at' => 'datetime', 'assembled_at' => 'datetime', 'min_level' => 'integer', 'max_members' => 'integer', 'excluded_florr_ids' => 'array'];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'team_members')
            ->withPivot(['joined_at', 'last_read_message_id'])
            ->orderByPivot('joined_at');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(TeamMessage::class);
    }
}
