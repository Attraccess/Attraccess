# Releasing a board revision

How a revision of the Touch P4 board goes from the repository to an order, and how
it is recorded so the boards in the field can be traced back to their files.

## Source of truth

The circuit description in `scripts/bootstrap/` (`design.py`, `circuit_core.py`,
`circuit_io.py`, the placement and routing scripts) is the master. The KiCad files in
`kicad/` and the package in `fab/jlcpcb/` are generated from it and committed, so that
they can be opened, reviewed and ordered without running anything. Do not edit the
KiCad files by hand: the next generator run overwrites the edit, and `check` fails
when the KiCad files differ from what the generator gives (see the README).

## Before an order

1. `pnpm nx run attractap-touch-p4-pcb:check` passes: tests, ERC, netlist against the
   circuit description, DRC with schematic parity, the simulations, and `fab/jlcpcb/`
   matching the board.
2. `pnpm nx run attractap-touch-p4-pcb:check-footprints` passes (it needs the internet).
3. Stock: every line of the parts list of the variant to be ordered is in stock at
   JLCPCB, or ordered in through its parts sourcing (see "Sourcing risks" in the
   design notes).
4. Someone other than the author reads the schematic PDF, the fabrication drawing and
   the assembly drawing (`fab/`), checks the open points of the design notes, and
   signs off: their name goes into `CHECKED_BY` in `scripts/bootstrap/build_sch.py`,
   which puts it into every title block. Regenerate the schematic and commit.
5. A new revision letter if anything changed since the last order: `rev` in the title
   blocks (`build_sch.py`), `REV` on the silkscreen (`silk.py`), and a line in
   `HISTORY` in `build_sch.py` (it is the revision history on the root sheet).

## The order

- Upload `fab/jlcpcb/attractap-touch-p4-gerbers.zip`, the BOM and CPL files of the
  variant, and set the order form as the README's table says (stack-up, finish,
  impedance control, via filling).
- Keep JLCPCB's order number with the commit: in the commit message of the commit that
  records the order, or in the design notes.

## After the order

- Record the commit an order was made from as a git tag `touch-p4-rev-<letter>` (for
  example `touch-p4-rev-A`), on the commit that holds the files sent. The maintainer
  creates and pushes the tag; it is not created by tools or by the generator.
- What the first boards show goes into the design notes, and what has to change into a
  new revision.
