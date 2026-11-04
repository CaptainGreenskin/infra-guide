C, B = 300e12, 2e12
for M in (1, 256):
    K = N = 4096
    flops = 2 * M * K * N
    nbytes = 2 * (M*K + K*N + M*N)
    print(M, flops, nbytes, round(flops/nbytes, 4),
          round(flops/C*1e6, 3), round(nbytes/B*1e6, 3))
