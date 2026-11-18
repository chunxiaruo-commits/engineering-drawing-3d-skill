"""Sample and pack a vectorized implicit solid for the offline viewer."""

import gzip
import struct

import numpy as np


def union(*fields):
    return np.minimum.reduce(np.broadcast_arrays(*fields))


def solid(*fields):
    return np.maximum.reduce(np.broadcast_arrays(*fields))


def between(value, low, high):
    return np.maximum(low - value, value - high)


# Each grid cell splits into six tetrahedra with consistently shared diagonals.
corners = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
                    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]])
tets = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
        [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]]


def evaluate(field, points):
    return field(*np.moveaxis(points, -1, 0))


def crossings(field, inside, outside):
    for _ in range(8):
        middle = (inside + outside) / 2
        negative = evaluate(field, middle)[:, None] < 0
        inside = np.where(negative, middle, inside)
        outside = np.where(negative, outside, middle)
    return (inside + outside) / 2


def pack_mesh(field, bounds, step, clip=None):
    low, high = map(np.array, zip(*bounds))
    if not np.isfinite(step) or step <= 0 or np.any(~np.isfinite(low)) or np.any(~np.isfinite(high)) or np.any(high <= low):
        raise ValueError('Use positive step and finite, increasing axis bounds.')
    center = (low + high) / 2
    radius = np.linalg.norm(high - low) / 2
    boundary = field if clip is None else lambda x, d, z: solid(field(x, d, z), clip(x, d, z))
    origin = low - step * 1.317
    coordinates = [np.arange(start, stop + 2 * step, step) for start, stop in zip(origin, high)]
    distances = boundary(*np.meshgrid(*coordinates, indexing='ij', sparse=True))
    size = distances.shape
    layers = np.stack([distances[i:size[0]-1+i, j:size[1]-1+j, k:size[2]-1+k]
                       for i, j, k in corners], axis=-1)
    signs = layers < 0
    active = signs.any(axis=-1) & ~signs.all(axis=-1)
    nodes = origin + np.argwhere(active)[:, None, :] * step + corners[None, :, :] * step
    signs = signs[active]
    faces = []
    for tet in tets:
        keys = (signs[:, tet] * np.array([1, 2, 4, 8])).sum(axis=1)
        for mask in range(1, 15):
            group = nodes[keys == mask][:, tet]
            if len(group) == 0:
                continue
            inside = [index for index in range(4) if mask & (1 << index)]
            outside = [index for index in range(4) if not mask & (1 << index)]
            edge = lambda a, b: crossings(boundary, group[:, a], group[:, b])
            if len(inside) == 1 or len(outside) == 1:
                pieces = [edge(a, b) for a in inside for b in outside]
                faces.append(np.stack(pieces, axis=1))
            else:
                a, b = inside
                c, d = outside
                ac, ad, bc, bd = edge(a, c), edge(a, d), edge(b, c), edge(b, d)
                faces.extend([np.stack([ac, ad, bd], axis=1), np.stack([ac, bd, bc], axis=1)])
    if not faces:
        raise ValueError('No solid surface found. Check bounds, step and field sign.')
    faces = np.concatenate(faces, axis=0)
    middle = faces.mean(axis=1)
    offsets = np.eye(3) * 0.065

    def normals(points, fn):
        return np.stack([evaluate(fn, points + offset) - evaluate(fn, points - offset)
                         for offset in offsets], axis=-1)

    plane_faces = np.zeros(len(faces), dtype=bool)
    if clip is not None:
        distances_to_plane = evaluate(clip, faces)
        plane_faces = np.max(abs(distances_to_plane), axis=1) < step * 0.045
    outward = normals(middle, field)
    face_vector = np.cross(faces[:, 1] - faces[:, 0], faces[:, 2] - faces[:, 0])
    if clip is not None:
        outward[plane_faces] = normals(middle[plane_faces], clip)
    flip = (face_vector * outward).sum(axis=1) < 0
    faces[flip] = faces[flip][:, [0, 2, 1]]
    normal = normals(faces, field)
    normal[plane_faces] = outward[plane_faces, None, :]
    normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), 1e-10)
    section = np.repeat(plane_faces[:, None, None], 3, axis=1).astype(int)
    records = np.concatenate([np.rint((faces - center) / radius * 30000),
                              np.rint(normal * 30000), section * 30000], axis=-1)
    records = records.astype('<i2').reshape(-1, 7)
    vertices, indices = np.unique(records, axis=0, return_inverse=True)
    indices = indices.reshape(-1, 3)
    mask = (indices[:, 0] != indices[:, 1]) & (indices[:, 1] != indices[:, 2]) & (indices[:, 0] != indices[:, 2])
    indices = indices[mask]
    short = len(vertices) < 65536
    packed = struct.pack('<3I', len(vertices), indices.size, 2 if short else 4)
    packed += vertices.tobytes() + indices.astype('<u2' if short else '<u4').tobytes()
    return gzip.compress(packed, compresslevel=7, mtime=0)


def write_mesh(path, field, bounds, step, clip=None):
    """Write a gzip mesh for the offline viewer."""
    with open(path, "wb") as stream:
        stream.write(pack_mesh(field, bounds, step, clip))
