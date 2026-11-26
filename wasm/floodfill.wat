(module
  (memory (export "memory") 1)
  ;; grid: u8 array at offset 0, 1=surface, 0=empty -> marks outside as 2
  ;; queue: i32 array at queueOffset (byte offset)
  ;; returns number of outside cells marked
  (func (export "flood_outside") (param $gx i32) (param $gy i32) (param $gz i32) (param $qoff i32) (result i32)
    (local $total i32) (local $head i32) (local $tail i32)
    (local $idx i32) (local $x i32) (local $y i32) (local $z i32)
    (local $tmp i32) (local $plane i32) (local $count i32)
    (local $nidx i32)
    (local.set $plane (i32.mul (local.get $gx) (local.get $gz))) ;; per-y stride
    (local.set $total (i32.mul (local.get $plane) (local.get $gy)))
    ;; if grid[0] != 0 return 0
    (if (i32.load8_u (i32.const 0)) (then (return (i32.const 0))))
    ;; mark 0 and enqueue
    (i32.store8 (i32.const 0) (i32.const 2))
    (i32.store (local.get $qoff) (i32.const 0))
    (local.set $head (i32.const 0))
    (local.set $tail (i32.const 1))
    (local.set $count (i32.const 1))
    (block $done
      (loop $loop
        (br_if $done (i32.ge_u (local.get $head) (local.get $tail)))
        (local.set $idx (i32.load (i32.add (local.get $qoff) (i32.mul (local.get $head) (i32.const 4)))))
        (local.set $head (i32.add (local.get $head) (i32.const 1)))
        ;; decode: y = idx / plane; rem = idx % plane; z = rem / gx; x = rem % gx
        (local.set $y (i32.div_u (local.get $idx) (local.get $plane)))
        (local.set $tmp (i32.rem_u (local.get $idx) (local.get $plane)))
        (local.set $z (i32.div_u (local.get $tmp) (local.get $gx)))
        (local.set $x (i32.rem_u (local.get $tmp) (local.get $gx)))
        ;; neighbor -x
        (if (i32.gt_u (local.get $x) (i32.const 0)) (then
          (local.set $nidx (i32.sub (local.get $idx) (i32.const 1)))
          (if (i32.eqz (i32.load8_u (local.get $nidx))) (then
            (i32.store8 (local.get $nidx) (i32.const 2))
            (i32.store (i32.add (local.get $qoff) (i32.mul (local.get $tail) (i32.const 4))) (local.get $nidx))
            (local.set $tail (i32.add (local.get $tail) (i32.const 1)))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))))))
        ;; neighbor +x
        (if (i32.lt_u (local.get $x) (i32.sub (local.get $gx) (i32.const 1))) (then
          (local.set $nidx (i32.add (local.get $idx) (i32.const 1)))
          (if (i32.eqz (i32.load8_u (local.get $nidx))) (then
            (i32.store8 (local.get $nidx) (i32.const 2))
            (i32.store (i32.add (local.get $qoff) (i32.mul (local.get $tail) (i32.const 4))) (local.get $nidx))
            (local.set $tail (i32.add (local.get $tail) (i32.const 1)))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))))))
        ;; neighbor -z
        (if (i32.gt_u (local.get $z) (i32.const 0)) (then
          (local.set $nidx (i32.sub (local.get $idx) (local.get $gx)))
          (if (i32.eqz (i32.load8_u (local.get $nidx))) (then
            (i32.store8 (local.get $nidx) (i32.const 2))
            (i32.store (i32.add (local.get $qoff) (i32.mul (local.get $tail) (i32.const 4))) (local.get $nidx))
            (local.set $tail (i32.add (local.get $tail) (i32.const 1)))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))))))
        ;; neighbor +z
        (if (i32.lt_u (local.get $z) (i32.sub (local.get $gz) (i32.const 1))) (then
          (local.set $nidx (i32.add (local.get $idx) (local.get $gx)))
          (if (i32.eqz (i32.load8_u (local.get $nidx))) (then
            (i32.store8 (local.get $nidx) (i32.const 2))
            (i32.store (i32.add (local.get $qoff) (i32.mul (local.get $tail) (i32.const 4))) (local.get $nidx))
            (local.set $tail (i32.add (local.get $tail) (i32.const 1)))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))))))
        ;; neighbor -y
        (if (i32.gt_u (local.get $y) (i32.const 0)) (then
          (local.set $nidx (i32.sub (local.get $idx) (local.get $plane)))
          (if (i32.eqz (i32.load8_u (local.get $nidx))) (then
            (i32.store8 (local.get $nidx) (i32.const 2))
            (i32.store (i32.add (local.get $qoff) (i32.mul (local.get $tail) (i32.const 4))) (local.get $nidx))
            (local.set $tail (i32.add (local.get $tail) (i32.const 1)))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))))))
        ;; neighbor +y
        (if (i32.lt_u (local.get $y) (i32.sub (local.get $gy) (i32.const 1))) (then
          (local.set $nidx (i32.add (local.get $idx) (local.get $plane)))
          (if (i32.eqz (i32.load8_u (local.get $nidx))) (then
            (i32.store8 (local.get $nidx) (i32.const 2))
            (i32.store (i32.add (local.get $qoff) (i32.mul (local.get $tail) (i32.const 4))) (local.get $nidx))
            (local.set $tail (i32.add (local.get $tail) (i32.const 1)))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))))))
        (br $loop)))
    (local.get $count))
)
