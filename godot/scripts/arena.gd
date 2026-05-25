## Arena — procgen MOBA map + hero spawner.
##
## Builds a 30×20 grid of Sprite2D terrain tiles (grass + diagonal river +
## scattered decorations), then spawns 1 player + 3 enemy heroes at fixed
## positions. Camera2D follows the player.
##
## Why procgen instead of a TileMap node:
##   - .tscn TileMap cell data is binary-packed and brittle to hand-write
##   - this approach lets us version-control the map LAYOUT (in this script)
##     instead of the cell encoding
##   - the user can re-tune by editing this script, no editor dance needed
##
## To swap to a "real" TileMap later: add a TileMap node in main.tscn,
## drag tdshooter_tilesheet.png or tilemap_packed.png into TileSet, paint
## an arena, then delete this script. Both approaches coexist fine.
extends Node2D

## Tile size in source pixels (Tiny Battle tiles are 16×16).
const SRC_TILE := 16

## Render scale — 16px tile drawn at 4× = 64px on screen.
const RENDER_SCALE := 4

## Effective tile size on screen.
const TILE_SIZE := SRC_TILE * RENDER_SCALE

## Arena grid dimensions in tiles.
@export var grid_w: int = 30
@export var grid_h: int = 20

## Hero scene to instantiate. Set in inspector to res://scenes/hero.tscn.
@export var hero_scene: PackedScene

## Player + enemy sprite textures. Drag from assets/sprites/ in inspector.
@export var player_sprite: Texture2D
@export var enemy_sprites: Array[Texture2D] = []

# Terrain tiles preloaded — paths are stable, so use preload (compile-time).
const TILE_GRASS_A: Texture2D = preload("res://assets/tiles/individual/tile_0000.png")
const TILE_GRASS_B: Texture2D = preload("res://assets/tiles/individual/tile_0001.png")
const TILE_GRASS_C: Texture2D = preload("res://assets/tiles/individual/tile_0002.png")
const TILE_WATER_A: Texture2D = preload("res://assets/tiles/individual/tile_0003.png")
const TILE_WATER_B: Texture2D = preload("res://assets/tiles/individual/tile_0004.png")
const TILE_BUSH:    Texture2D = preload("res://assets/tiles/individual/tile_0005.png")
const TILE_ROCK:    Texture2D = preload("res://assets/tiles/individual/tile_0006.png")

# Fixed decoration positions (in tile coords). Distinct from the procgen
# river so the user can hand-tune the visual without changing the river logic.
const DECORATIONS := [
    [Vector2i(4, 3),  TILE_BUSH],
    [Vector2i(7, 5),  TILE_BUSH],
    [Vector2i(22, 4), TILE_BUSH],
    [Vector2i(26, 6), TILE_BUSH],
    [Vector2i(3, 16), TILE_BUSH],
    [Vector2i(20, 17), TILE_BUSH],
    [Vector2i(11, 2), TILE_ROCK],
    [Vector2i(18, 14), TILE_ROCK],
    [Vector2i(28, 12), TILE_ROCK],
]

# Hero spawn positions (in tile coords) — player bottom-left, enemies top-right.
const PLAYER_SPAWN_TILE := Vector2i(3, 17)
const ENEMY_SPAWN_TILES := [
    Vector2i(25, 3),
    Vector2i(27, 5),
    Vector2i(23, 5),
]

@onready var _terrain: Node2D = $Terrain
@onready var _decorations_layer: Node2D = $Decorations
@onready var _heroes: Node2D = $Heroes

var _player: Hero = null

func _ready() -> void:
    _build_terrain()
    _build_decorations()
    _spawn_heroes()

# ── Public helpers ──────────────────────────────────────────────────────────

## Returns the world-space center of a given tile coord.
func tile_to_world(tile: Vector2i) -> Vector2:
    return Vector2(tile.x * TILE_SIZE + TILE_SIZE / 2.0,
                   tile.y * TILE_SIZE + TILE_SIZE / 2.0)

## Returns the player Hero node (created in _spawn_heroes), or null if not ready.
func get_player() -> Hero:
    return _player

# ── Build steps ────────────────────────────────────────────────────────────

func _build_terrain() -> void:
    for y in grid_h:
        for x in grid_w:
            _place_tile(x, y, _terrain_at(x, y))

## Returns the terrain texture for a given grid cell. Encodes the map layout:
##   - a diagonal river running from (top-mid) to (bottom-right) splits the map
##   - everything else is grass, with deterministic variant for visual variety
func _terrain_at(x: int, y: int) -> Texture2D:
    # River: y ≈ 0.55 * x + 4, with a 2-tile wide band. Tuned so it cuts
    # diagonally across without blocking the spawn corners.
    var river_line: float = 0.55 * x + 4.0
    var dist_from_river: float = abs(float(y) - river_line)
    if dist_from_river < 1.0:
        return TILE_WATER_B  # core river
    if dist_from_river < 2.0:
        return TILE_WATER_A  # river edge
    # Grass: 3 variants, deterministic-hash by position
    var h: int = (x * 7 + y * 13) % 12
    if h < 8:
        return TILE_GRASS_A
    elif h < 11:
        return TILE_GRASS_B
    else:
        return TILE_GRASS_C

func _place_tile(x: int, y: int, tex: Texture2D) -> void:
    var s := Sprite2D.new()
    s.texture = tex
    s.scale = Vector2(RENDER_SCALE, RENDER_SCALE)
    s.position = tile_to_world(Vector2i(x, y))
    s.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST  # pixel-perfect, no blur
    _terrain.add_child(s)

func _build_decorations() -> void:
    for entry in DECORATIONS:
        var tile: Vector2i = entry[0]
        var tex: Texture2D = entry[1]
        var s := Sprite2D.new()
        s.texture = tex
        s.scale = Vector2(RENDER_SCALE, RENDER_SCALE)
        s.position = tile_to_world(tile)
        s.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
        _decorations_layer.add_child(s)

func _spawn_heroes() -> void:
    if hero_scene == null:
        push_error("Arena: hero_scene not assigned in inspector")
        return

    # Player
    _player = hero_scene.instantiate() as Hero
    _player.is_player = true
    _player.position = tile_to_world(PLAYER_SPAWN_TILE)
    if player_sprite:
        _apply_hero_sprite(_player, player_sprite, Color(0.4, 1.0, 0.85))
    _heroes.add_child(_player)

    # Enemies — cycle through enemy_sprites for visual variety
    for i in ENEMY_SPAWN_TILES.size():
        var enemy := hero_scene.instantiate() as Hero
        enemy.is_player = false
        enemy.position = tile_to_world(ENEMY_SPAWN_TILES[i])
        if not enemy_sprites.is_empty():
            var tex: Texture2D = enemy_sprites[i % enemy_sprites.size()]
            _apply_hero_sprite(enemy, tex, Color(1.0, 0.4, 0.4))
        _heroes.add_child(enemy)

## Swap a hero's placeholder ColorRect "Body" for a Sprite2D with the given
## texture. Tints any remaining ColorRect with `team_color` as a fallback.
func _apply_hero_sprite(hero: Hero, tex: Texture2D, team_color: Color) -> void:
    var body: Node = hero.get_node_or_null("Body")
    if body and body is ColorRect:
        var sprite := Sprite2D.new()
        sprite.name = "Sprite"
        sprite.texture = tex
        sprite.scale = Vector2(0.06, 0.06)  # 512×512 source → ~30×30 on screen
        hero.add_child(sprite)
        body.queue_free()
    # Always tint the label so player/enemy team identity is unmistakable.
    var label: Node = hero.get_node_or_null("Label")
    if label and label is Label:
        (label as Label).add_theme_color_override("font_color", team_color)
        (label as Label).text = "PLAYER" if hero.is_player else "ENEMY"
