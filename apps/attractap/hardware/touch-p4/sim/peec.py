"""Small quasi-static PEEC solver (partial inductances of axis-aligned bars), in the manner of FastHenry.

Conductors are sets of straight filaments along x or y. Each filament is a branch between two nodes
with R + jwL and mutual inductance to every parallel filament. Wide tracks are split into several
filaments across their width, so the current is free to crowd at the edges; copper areas are meshed
into a grid of filaments. Lengths in metres."""
import numpy as np

MU0 = 4e-7 * np.pi
RHO_CU = 1.72e-8


def _g(u, d):
    return u * np.arcsinh(u / d) - np.sqrt(u * u + d * d)


def mutual(a1, b1, a2, b2, d):
    """Mutual partial inductance of two parallel filaments [a1,b1] and [a2,b2] at distance d."""
    return MU0 / (4 * np.pi) * (_g(b1 - a2, d) + _g(a1 - b2, d) - _g(b1 - b2, d) - _g(a1 - a2, d))


def self_bar(length, w, t):
    """Self partial inductance of a straight bar with rectangular cross-section (Ruehli)."""
    return MU0 * length / (2 * np.pi) * (np.log(2 * length / (w + t)) + 0.5 + 0.2235 * (w + t) / length)


class Mesh:
    def __init__(self):
        self.axis, self.lo, self.hi, self.tr, self.z, self.w, self.t = [], [], [], [], [], [], []
        self.n1, self.n2, self.sign, self.rho = [], [], [], []
        self.nnodes = 0

    def node(self):
        self.nnodes += 1
        return self.nnodes - 1

    def branch(self, axis, p1, p2, tr, z, w, t, n1, n2, rho=RHO_CU):
        """Filament along `axis` (0 = x, 1 = y) from p1 to p2 at transverse position tr, from node n1 to n2."""
        self.axis.append(axis); self.lo.append(min(p1, p2)); self.hi.append(max(p1, p2))
        self.tr.append(tr); self.z.append(z); self.w.append(w); self.t.append(t)
        self.n1.append(n1); self.n2.append(n2); self.sign.append(1.0 if p2 > p1 else -1.0); self.rho.append(rho)
        return len(self.axis) - 1

    def track(self, pts, width, t, z, nfil=7):
        """A track along the axis-aligned polyline pts, split into nfil filaments. Returns its end nodes."""
        # filaments narrower at the edges, where the current crowds
        k = np.arange(nfil + 1) / nfil
        edges = 0.5 * (1 - np.cos(np.pi * k)) * width - width / 2 if nfil > 2 else k * width - width / 2
        centres, widths = (edges[1:] + edges[:-1]) / 2, np.diff(edges)
        nodes = [self.node() for _ in pts]
        for i in range(len(pts) - 1):
            (x1, y1), (x2, y2) = pts[i], pts[i + 1]
            axis = 0 if abs(x2 - x1) > abs(y2 - y1) else 1
            for c, wf in zip(centres, widths):
                if axis == 0:
                    self.branch(0, x1, x2, y1 + c, z, wf, t, nodes[i], nodes[i + 1])
                else:
                    self.branch(1, y1, y2, x1 + c, z, wf, t, nodes[i], nodes[i + 1])
        return nodes[0], nodes[-1]

    def sheet(self, mask, x0, y0, h, t, z, rho=RHO_CU):
        """A copper area: mask[iy, ix] says which cells of size h (lower left corner x0, y0) are copper."""
        ny, nx = mask.shape
        idx = -np.ones(mask.shape, dtype=int)
        for iy, ix in zip(*np.nonzero(mask)):
            idx[iy, ix] = self.node()
        for iy, ix in zip(*np.nonzero(mask)):
            xc, yc = x0 + (ix + 0.5) * h, y0 + (iy + 0.5) * h
            if ix + 1 < nx and mask[iy, ix + 1]:
                self.branch(0, xc, xc + h, yc, z, h, t, idx[iy, ix], idx[iy, ix + 1], rho)
            if iy + 1 < ny and mask[iy + 1, ix]:
                self.branch(1, yc, yc + h, xc, z, h, t, idx[iy, ix], idx[iy + 1, ix], rho)
        return idx

    def impedance(self, freq, n_in, n_out):
        """Impedance between two nodes, every other conductor left floating. Returns (Z, branch currents)."""
        w = 2 * np.pi * freq
        axis = np.array(self.axis); lo = np.array(self.lo); hi = np.array(self.hi)
        tr = np.array(self.tr); z = np.array(self.z); wd = np.array(self.w); th = np.array(self.t)
        sign = np.array(self.sign); rho = np.array(self.rho)
        nb = len(axis)
        length = hi - lo
        # AC resistance: the current flows in a skin of depth delta on both faces of the foil; for a foil
        # much thinner than that the expression becomes its full thickness
        delta = np.sqrt(rho / (np.pi * freq * MU0))
        t_eff = 2 * delta * (1 - np.exp(-th / (2 * delta)))
        R = rho * length / (wd * t_eff)
        Y = np.zeros((nb, nb), dtype=complex)
        for ax in (0, 1):
            sel = np.nonzero(axis == ax)[0]
            if not len(sel):
                continue
            a, b_, y, zz, ww, tt, s = lo[sel], hi[sel], tr[sel], z[sel], wd[sel], th[sel], sign[sel]
            d = np.hypot(y[:, None] - y[None, :], zz[:, None] - zz[None, :])
            gmd = 0.2235 * (ww + tt)
            d = np.maximum(d, np.maximum(gmd[:, None], gmd[None, :]))
            L = mutual(a[:, None], b_[:, None], a[None, :], b_[None, :], d)
            L[np.diag_indices(len(sel))] = self_bar(b_ - a, ww, tt)
            L *= s[:, None] * s[None, :]
            Zb = 1j * w * L
            Zb[np.diag_indices(len(sel))] += R[sel]
            Y[np.ix_(sel, sel)] = np.linalg.inv(Zb)
        # nodal analysis; one reference node per connected conductor
        n1, n2 = np.array(self.n1), np.array(self.n2)
        A = np.zeros((self.nnodes, nb))
        A[n1, np.arange(nb)] = 1.0
        A[n2, np.arange(nb)] = -1.0
        Yn = A @ Y @ A.T
        ref = self._references(n1, n2, n_out)
        keep = np.setdiff1d(np.arange(self.nnodes), ref)
        J = np.zeros(self.nnodes, dtype=complex)
        J[n_in] = 1.0
        V = np.zeros(self.nnodes, dtype=complex)
        V[keep] = np.linalg.solve(Yn[np.ix_(keep, keep)], J[keep])
        I = Y @ (A.T @ V)
        return V[n_in] - V[n_out], I

    def field_z(self, currents, points):
        """Magnetic field strength normal to the conductors' plane (A/m, complex) at points (n, 3), for the
        branch currents that impedance() returned: Biot-Savart for every straight filament."""
        axis = np.array(self.axis); lo = np.array(self.lo); hi = np.array(self.hi)
        tr = np.array(self.tr); z = np.array(self.z); sign = np.array(self.sign)
        cur = np.asarray(currents) * sign                     # along the positive axis
        px, py, pz = (np.asarray(points)[:, k][:, None] for k in range(3))
        along = np.where(axis == 0, px, py)                   # the point's coordinate along each filament
        across = np.where(axis == 0, py, px) - tr[None, :]    # and at a right angle to it, in the plane
        dz = pz - z[None, :]
        rho2 = np.maximum(across ** 2 + dz ** 2, 1e-12)
        u1, u2 = lo[None, :] - along, hi[None, :] - along
        s = u2 / np.sqrt(u2 ** 2 + rho2) - u1 / np.sqrt(u1 ** 2 + rho2)
        # a filament along x gives Hz = +I s dy / (4 pi rho^2), one along y gives -I s dx / (4 pi rho^2)
        turn = np.where(axis == 0, 1.0, -1.0)[None, :]
        return ((cur[None, :] * turn) * s * across / (4 * np.pi * rho2)).sum(axis=1)

    def _references(self, n1, n2, n_out):
        parent = list(range(self.nnodes))
        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i
        for a, b in zip(n1, n2):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb
        roots = {}
        for i in range(self.nnodes):
            roots.setdefault(find(i), i)
        roots[find(n_out)] = n_out
        return np.array(sorted(roots.values()))
