<?php

namespace App\Services;

use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

class GeoHuntMapService
{
    private const GID_MASK = 0x0fffffff;
    private array $loaded = [];

    public function keys(): array
    {
        return $this->cache()->rememberForever('geo-hunt-map-keys:v3:'.$this->mapSetVersion(), function (): array {
            $files = glob($this->root().DIRECTORY_SEPARATOR.'maps'.DIRECTORY_SEPARATOR.'*.tmj') ?: [];
            $keys = [];
            foreach ($files as $file) {
                $key = pathinfo($file, PATHINFO_FILENAME);
                try {
                    $this->load($key);
                    $keys[] = $key;
                } catch (RuntimeException $exception) {
                    report($exception);
                }
            }

            if ($keys === []) {
                throw new RuntimeException('没有可用的图寻地图。');
            }

            return $keys;
        });
    }

    public function load(string $key): array
    {
        if (! preg_match('/^[A-Za-z0-9_-]+$/', $key)) {
            throw new RuntimeException('地图标识无效。');
        }

        $path = $this->root().DIRECTORY_SEPARATOR.'maps'.DIRECTORY_SEPARATOR.$key.'.tmj';
        if (! is_file($path)) {
            throw new RuntimeException("地图 {$key} 不存在。");
        }

        $cacheKey = 'geo-hunt-map:v3:'.$key.':'.$this->mapVersion($path);

        return $this->loaded[$cacheKey] ??= $this->cache()->rememberForever($cacheKey, fn (): array => $this->parse($path, $key));
    }

    public function clientDocument(string $key): array
    {
        $path = $this->mapPath($key);
        $cacheKey = 'geo-hunt-map-document:v3:'.$key.':'.$this->mapVersion($path);

        return $this->cache()->rememberForever($cacheKey, function () use ($key): array {
            $map = $this->load($key);
            $map['layers'] = array_map(function (array $layer): array {
                $compressed = gzencode(pack('V*', ...$layer['data']), 6);
                if ($compressed === false) {
                    throw new RuntimeException('无法压缩图寻图层。');
                }

                return ['name' => $layer['name'], 'encoding' => 'base64-gzip-u32le', 'data' => base64_encode($compressed)];
            }, $map['layers']);
            $json = json_encode(['data' => $map], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);

            return ['json' => $json, 'etag' => sha1($json), 'bytes' => strlen($json)];
        });
    }

    public function snippet(array $map, int $x, int $y, int $size): array
    {
        $layers = [];
        $usedTiles = [];
        foreach ($map['layers'] as $layer) {
            $data = [];
            for ($row = 0; $row < $size; $row++) {
                $start = (($y + $row) * $map['width']) + $x;
                array_push($data, ...array_slice($layer['data'], $start, $size));
            }
            $layers[] = ['name' => $layer['name'], 'data' => $data];
        }

        return ['width' => $size, 'height' => $size, 'layers' => $layers];
    }

    public function cachedSnippet(string $key, int $x, int $y, int $size): array
    {
        $path = $this->mapPath($key);
        $cacheKey = "geo-hunt-snippet:v3:{$key}:{$x}:{$y}:{$size}:".$this->mapVersion($path);

        return $this->cache()->rememberForever($cacheKey, fn (): array => $this->snippet($this->load($key), $x, $y, $size));
    }

    public function randomTarget(array $map): array
    {
        $shortSide = min($map['width'], $map['height']);
        $size = min(5, max(3, (int) floor($shortSide / 3)));
        $size = min($size, $shortSide);
        $best = [0, 0];
        $bestVariety = -1;

        for ($attempt = 0; $attempt < 50; $attempt++) {
            $x = random_int(0, max(0, $map['width'] - $size));
            $y = random_int(0, max(0, $map['height'] - $size));
            $tiles = [];
            foreach ($map['layers'] as $layer) {
                for ($row = 0; $row < $size; $row++) {
                    $start = (($y + $row) * $map['width']) + $x;
                    foreach (array_slice($layer['data'], $start, $size) as $rawGid) {
                        $gid = $rawGid & self::GID_MASK;
                        if ($gid > 0) {
                            $tiles[$gid] = true;
                        }
                    }
                }
            }
            if (count($tiles) > $bestVariety) {
                $best = [$x, $y];
                $bestVariety = count($tiles);
            }
            if ($bestVariety >= 3) {
                break;
            }
        }

        [$x, $y] = $best;

        return [
            'x' => $x,
            'y' => $y,
            'size' => $size,
            'targetX' => ($x + ($size / 2)) / $map['width'],
            'targetY' => ($y + ($size / 2)) / $map['height'],
        ];
    }

    private function parse(string $path, string $key): array
    {
        $map = $this->json($path);
        if (($map['orientation'] ?? null) !== 'orthogonal' || ($map['infinite'] ?? false)) {
            throw new RuntimeException("地图 {$key} 必须是有限正交地图。");
        }

        $width = (int) ($map['width'] ?? 0);
        $height = (int) ($map['height'] ?? 0);
        if ($width < 1 || $height < 1) {
            throw new RuntimeException("地图 {$key} 尺寸无效。");
        }

        $tiles = [];
        foreach ($map['tilesets'] ?? [] as $reference) {
            $firstGid = (int) ($reference['firstgid'] ?? 1);
            $tilesetPath = $this->resolveTileset($path, (string) ($reference['source'] ?? ''));
            $tileset = $this->json($tilesetPath);
            foreach ($tileset['tiles'] ?? [] as $tile) {
                $image = str_replace('\\', '/', (string) ($tile['image'] ?? ''));
                if (! str_starts_with($image, 'tiles/')) {
                    continue;
                }
                $absoluteImage = $this->root().DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $image);
                if (! is_file($absoluteImage)) {
                    continue;
                }
                $tiles[(string) ($firstGid + (int) $tile['id'])] = [
                    'imageUrl' => '/geo-hunt-assets/'.$image,
                    'width' => (int) ($tile['imagewidth'] ?? $tileset['tilewidth'] ?? 256),
                    'height' => (int) ($tile['imageheight'] ?? $tileset['tileheight'] ?? 256),
                ];
            }
        }

        $layers = [];
        foreach ($map['layers'] ?? [] as $layer) {
            if (($layer['type'] ?? null) !== 'tilelayer') {
                continue;
            }
            $data = $this->decodeLayer($layer, $width * $height, $key);
            foreach ($data as $rawGid) {
                $gid = $rawGid & self::GID_MASK;
                if ($gid > 0 && ! isset($tiles[(string) $gid])) {
                    throw new RuntimeException("地图 {$key} 引用了缺失图块 GID {$gid}。");
                }
                if ($gid > 0) {
                    $usedTiles[(string) $gid] = true;
                }
            }
            $layers[] = ['name' => (string) ($layer['name'] ?? 'layer'), 'data' => $data];
        }

        if ($layers === []) {
            throw new RuntimeException("地图 {$key} 没有图块层。");
        }

        return [
            'key' => $key,
            'width' => $width,
            'height' => $height,
            'tileWidth' => (int) ($map['tilewidth'] ?? 512),
            'tileHeight' => (int) ($map['tileheight'] ?? 512),
            'backgroundColor' => '#1EA761',
            'layers' => $layers,
            'tiles' => array_intersect_key($tiles, $usedTiles),
        ];
    }

    private function decodeLayer(array $layer, int $expected, string $key): array
    {
        if (($layer['encoding'] ?? null) !== 'base64' || ($layer['compression'] ?? null) !== 'gzip') {
            throw new RuntimeException("地图 {$key} 包含不支持的图层编码。");
        }
        $compressed = base64_decode(preg_replace('/\s+/', '', (string) ($layer['data'] ?? '')), true);
        $raw = $compressed === false ? false : gzdecode($compressed);
        if ($raw === false || strlen($raw) !== $expected * 4) {
            throw new RuntimeException("地图 {$key} 图层数据损坏。");
        }
        $values = array_values(unpack('V*', $raw) ?: []);

        return array_map(static fn (int $value): int => $value, $values);
    }

    private function resolveTileset(string $mapPath, string $source): string
    {
        $candidate = dirname($mapPath).DIRECTORY_SEPARATOR.str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $source);
        if ($source !== '' && is_file($candidate)) {
            return $candidate;
        }
        $fallback = $this->root().DIRECTORY_SEPARATOR.'tileset.tsj';
        if (! is_file($fallback)) {
            throw new RuntimeException('图寻 tileset.tsj 不存在。');
        }

        return $fallback;
    }

    private function json(string $path): array
    {
        $decoded = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($decoded)) {
            throw new RuntimeException("无法解析 {$path}。");
        }

        return $decoded;
    }

    private function root(): string
    {
        return rtrim((string) config('geo_hunt.map_root'), '/\\');
    }

    private function mapPath(string $key): string
    {
        if (! preg_match('/^[A-Za-z0-9_-]+$/', $key)) {
            throw new RuntimeException('地图标识无效。');
        }
        $path = $this->root().DIRECTORY_SEPARATOR.'maps'.DIRECTORY_SEPARATOR.$key.'.tmj';
        if (! is_file($path)) {
            throw new RuntimeException("地图 {$key} 不存在。");
        }

        return $path;
    }

    private function cache(): Repository
    {
        return Cache::store((string) config('geo_hunt.map_cache_store', 'file'));
    }

    private function mapVersion(string $path): string
    {
        return filemtime($path).'-'.filesize($path).'-'.$this->tilesetMtime();
    }

    private function mapSetVersion(): string
    {
        $directory = $this->root().DIRECTORY_SEPARATOR.'maps';

        return filemtime($directory).'-'.$this->tilesetMtime();
    }

    private function tilesetMtime(): int
    {
        $path = $this->root().DIRECTORY_SEPARATOR.'tileset.tsj';

        return is_file($path) ? (int) filemtime($path) : 0;
    }
}
