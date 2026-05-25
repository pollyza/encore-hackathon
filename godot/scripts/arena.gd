## Arena — procgen MOBA map + hero spawner.
##
## Builds an 18×11 grid of Sprite2D terrain tiles (grass + diagonal river +
## scattered decorations), then spawns 1 player + 3 enemy heroes at fixed
## positions. Sized so the entire arena fits a 1280×720 viewport at zoom 1.0
## with the camera fixed at map center — every entity visible from spawn,
## no walking through dark void to find anything.
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

## Arena grid dimensions in tiles. 18×11 × 64px = 1152×704 world units —
## fits a 1280×720 viewport at zoom 1.0 with small margin on each side.
@export var grid_w: int = 18
@export var grid_h: int = 11

## Hero scene to instantiate. Set in inspector to res://scenes/hero.tscn.
@export var hero_scene: PackedScene

## Player + enemy sprite textures. Drag from assets/sprites/ in inspector.
@export var player_sprite: Texture2D
@export var enemy_sprites: Array[Texture2D] = []

@export_group("Terrain overrides (Midjourney pass)")
## Optional MJ-generated textures. If set, override the Kenney defaults below.
## Drop your MJ outputs here via inspector — no GDScript edit needed.
## See assets/MIDJOURNEY_PROMPTS.md for the exact prompts.
@export var override_grass_a: Texture2D
@export var override_grass_b: Texture2D
@export var override_grass_c: Texture2D
@export var override_water_a: Texture2D
@export var override_water_b: Texture2D
@export var override_bush: Texture2D
@export var override_rock: Texture2D

## Hero sprite scale. Source PNGs are 512×512 vector chars but the actual
## character occupies ~40% of that. 0.25 → ~128px source = ~50px visible
## char, fits cleanly inside the 64px team ring.
const HERO_SPRITE_SCALE := Vector2(0.25, 0.25)

## Decoration scale — same as terrain (no bump). The modulate tint
## differentiates them from grass instead of size.
const DECORATION_SCALE := Vector2(RENDER_SCALE, RENDER_SCALE)

## Radius of the team-color ring drawn under each hero so the player can
## instantly distinguish friend/foe even before reading the label.
const HERO_RING_RADIUS := 32.0
const HERO_RING_THICKNESS := 4.0

## Default Q + W abilities slotted onto the player at spawn. Hard-coded
## preloads so the user gets a playable game on first F5 without manually
## dragging .tres into hero inspector slots.
const PLAYER_Q: Ability = preload("res://scripts/abilities/q_bolt_default.tres")
const PLAYER_W: Ability = preload("res://scripts/abilities/w_blast_default.tres")

# Terrain tiles preloaded — paths are stable, so use preload (compile-time).
const TILE_GRASS_A: Texture2D = preload("res://assets/tiles/individual/tile_0000.png")
const TILE_GRASS_B: Texture2D = preload("res://assets/tiles/individual/tile_0001.png")
const TILE_GRASS_C: Texture2D = preload("res://assets/tiles/individual/tile_0002.png")
const TILE_WATER_A: Texture2D = preload("res://assets/tiles/individual/tile_0003.png")
const TILE_WATER_B: Texture2D = preload("res://assets/tiles/individual/tile_0004.png")
const TILE_BUSH:    Texture2D = preload("res://assets/tiles/individual/tile_0005.png")
const TILE_ROCK:    Texture2D = preload("res://assets/tiles/individual/tile_0006.png")

# Fixed decoration positions (in tile coords). Tuned for the 18×11 map
# AND the river formula y=0.5x+3 — none of these placements sit on water.
# Split roughly 4 on player-side (south of river) and 4 on enemy-side
# (north of river) so neither half feels barren.
const DECORATIONS := [
	# Player side (south of river)
	[Vector2i(1, 8),   TILE_BUSH],
	[Vector2i(4, 10),  TILE_BUSH],
	[Vector2i(6, 9),   TILE_ROCK],
	[Vector2i(0, 10),  TILE_BUSH],
	# Enemy side (north of river)
	[Vector2i(12, 0),  TILE_BUSH],
	[Vector2i(15, 4),  TILE_BUSH],
	[Vector2i(17, 1),  TILE_ROCK],
	[Vector2i(17, 9),  TILE_BUSH],
]

# Hero spawn positions (in tile coords) — close enough that all 4 entities
# are visible from spawn on a single screen at zoom 1.0.
const PLAYER_SPAWN_TILE := Vector2i(2, 9)
const ENEMY_SPAWN_TILES := [
	Vector2i(15, 1),
	Vector2i(16, 2),
	Vector2i(14, 2),
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

## Returns the center of the full arena map in world coords. Useful for
## positioning a fixed Camera2D that shows the whole map at once.
func map_center() -> Vector2:
	return Vector2(grid_w * TILE_SIZE / 2.0, grid_h * TILE_SIZE / 2.0)

## Returns the player Hero node (created in _spawn_heroes), or null if not ready.
func get_player() -> Hero:
	return _player

# ── Build steps ────────────────────────────────────────────────────────────

func _build_terrain() -> void:
	for y in grid_h:
		for x in grid_w:
			_place_tile(x, y, _terrain_at(x, y))

## Returns the terrain texture for a given grid cell. Encodes map layout:
##   - a diagonal river splits the map into top-right vs bottom-left halves
##   - everything else is grass, with deterministic variant for variety
##
## River tuned so neither spawn (player bottom-left, enemies top-right)
## sits on water, and the river ACTUALLY separates the two teams the way
## a Dota lane does — top-left to bottom-right diagonal.
##
## Each tile pick consults the @export override first; falls back to the
## Kenney const if no MJ override is dragged into the inspector slot.
func _terrain_at(x: int, y: int) -> Texture2D:
	# River: y ≈ 0.5x + 3. Goes from top-left (x=0, y=3) to bottom-right
	# (x=16, y=11). 1.0-tile wide band — narrow enough to walk around but
	# visually clear as a separator. Tight band so spawns stay clear.
	var river_line: float = 0.5 * x + 3.0
	var dist_from_river: float = abs(float(y) - river_line)
	if dist_from_river < 0.6:
		return override_water_b if override_water_b else TILE_WATER_B
	if dist_from_river < 1.1:
		return override_water_a if override_water_a else TILE_WATER_A
	# Grass: 3 variants, deterministic-hash by position so the player sees
	# the same layout every run (helps with learning the map).
	var h: int = (x * 7 + y * 13) % 12
	if h < 8:
		return override_grass_a if override_grass_a else TILE_GRASS_A
	elif h < 11:
		return override_grass_b if override_grass_b else TILE_GRASS_B
	else:
		return override_grass_c if override_grass_c else TILE_GRASS_C

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
		# Apply MJ override if dropped into inspector
		var is_bush: bool = (tex == TILE_BUSH)
		var is_rock: bool = (tex == TILE_ROCK)
		if is_bush and override_bush:
			tex = override_bush
		elif is_rock and override_rock:
			tex = override_rock
		var s := Sprite2D.new()
		s.texture = tex
		s.scale = DECORATION_SCALE  # 1.0× terrain scale, blends in size-wise
		s.position = tile_to_world(tile)
		# Tints applied to KENNEY defaults only — MJ outputs assumed to already
		# have correct color from the prompt, no tinting needed.
		if is_bush and not override_bush:
			s.modulate = Color(0.85, 1.05, 0.85)
		elif is_rock and not override_rock:
			s.modulate = Color(0.75, 0.75, 0.8)
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
	_player.ability_q = PLAYER_Q
	_player.ability_w = PLAYER_W
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
## texture, draw a team-colored ring under the hero, and tint the label.
## The ring + label color is the primary friend/foe identifier — sprite
## modulate is only secondary because at this scale Kenney chars look alike.
func _apply_hero_sprite(hero: Hero, tex: Texture2D, team_color: Color) -> void:
	# 1. Team-color ground ring (drawn FIRST so it sits behind the sprite).
	var ring := _make_ring(team_color)
	ring.name = "TeamRing"
	ring.position = Vector2(0, 14)  # slight downward shift = "shadow under feet"
	hero.add_child(ring)

	# 2. Sprite (replaces the ColorRect placeholder from hero.tscn)
	var body: Node = hero.get_node_or_null("Body")
	if body and body is ColorRect:
		var sprite := Sprite2D.new()
		sprite.name = "Sprite"
		sprite.texture = tex
		sprite.scale = HERO_SPRITE_SCALE
		# Strong team tint for instant friend/foe identification.
		sprite.modulate = team_color
		hero.add_child(sprite)
		body.queue_free()

	# 3. Tint + retext the label
	var label: Node = hero.get_node_or_null("Label")
	if label and label is Label:
		(label as Label).add_theme_color_override("font_color", team_color)
		(label as Label).text = "PLAYER" if hero.is_player else "ENEMY"

## Builds a ring (annulus) using Polygon2D — cheap drawcall, no script needed.
func _make_ring(color: Color) -> Polygon2D:
	var ring := Polygon2D.new()
	ring.color = color
	# Outer + inner ring vertices, 32-segment circle
	var outer := PackedVector2Array()
	var inner := PackedVector2Array()
	var seg := 32
	for i in seg + 1:
		var t: float = float(i) / seg * TAU
		outer.append(Vector2(cos(t), sin(t)) * HERO_RING_RADIUS)
		inner.append(Vector2(cos(t), sin(t)) * (HERO_RING_RADIUS - HERO_RING_THICKNESS))
	# Concatenate as a single polygon (outer then inner reversed = annulus)
	var poly := PackedVector2Array()
	poly.append_array(outer)
	for i in range(inner.size() - 1, -1, -1):
		poly.append(inner[i])
	ring.polygon = poly
	return ring
