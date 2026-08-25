<?php

namespace Tests\Unit;

use App\Services\GeoHuntMapService;
use Tests\TestCase;

class GeoHuntMapServiceTest extends TestCase
{
    public function test_every_tmj_map_decodes_to_supported_tile_layers(): void
    {
        $service = app(GeoHuntMapService::class);
        $keys = $service->keys();

        $this->assertCount(16, $keys);
        foreach ($keys as $key) {
            $map = $service->load($key);
            $this->assertGreaterThan(0, $map['width']);
            $this->assertGreaterThan(0, $map['height']);
            $this->assertSame('#1EA761', $map['backgroundColor']);
            $this->assertNotEmpty($map['layers']);
            $usedGids = [];
            foreach ($map['layers'] as $layer) {
                $this->assertCount($map['width'] * $map['height'], $layer['data']);
                $this->assertArrayNotHasKey('type', $layer);
                foreach ($layer['data'] as $rawGid) {
                    $gid = $rawGid & 0x0fffffff;
                    if ($gid > 0) {
                        $usedGids[(string) $gid] = true;
                    }
                }
            }
            $expected = array_keys($usedGids);
            $actual = array_keys($map['tiles']);
            sort($expected);
            sort($actual);
            $this->assertSame($expected, $actual);
        }
    }

    public function test_client_document_uses_compact_gzip_layers(): void
    {
        $service = app(GeoHuntMapService::class);
        $document = $service->clientDocument('garden');
        $payload = json_decode($document['json'], true, 512, JSON_THROW_ON_ERROR)['data'];

        $this->assertSame(sha1($document['json']), $document['etag']);
        $this->assertLessThan(100_000, $document['bytes']);
        foreach ($payload['layers'] as $layer) {
            $raw = gzdecode(base64_decode($layer['data'], true));
            $this->assertSame('base64-gzip-u32le', $layer['encoding']);
            $this->assertNotFalse($raw);
            $this->assertSame($payload['width'] * $payload['height'] * 4, strlen($raw));
        }
    }

    public function test_snippet_does_not_expose_its_source_coordinates(): void
    {
        $service = app(GeoHuntMapService::class);
        $map = $service->load('garden');
        $snippet = $service->snippet($map, 10, 12, 5);

        $this->assertSame(5, $snippet['width']);
        $this->assertSame(5, $snippet['height']);
        $this->assertArrayNotHasKey('x', $snippet);
        $this->assertArrayNotHasKey('y', $snippet);
        $this->assertCount(25, $snippet['layers'][0]['data']);
    }
}
