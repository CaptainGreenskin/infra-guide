/* Perform FP32 loads and group their observed offsets by 32-byte sector. */
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

enum {
    LANES = 32,
    SECTOR_BYTES = 32,
    TILE_ELEMENTS = LANES * LANES,
    BUFFER_ELEMENTS = TILE_ELEMENTS + 1,
    MAX_SECTORS = (BUFFER_ELEMENTS * sizeof(float) + SECTOR_BYTES - 1) / SECTOR_BYTES
};

_Static_assert(sizeof(float) == 4, "this fixture requires 4-byte float");

static void trace_group(const volatile float *source, int first, int stride,
                        int active, float *output, bool *all_sectors,
                        int *sector_count_sum) {
    bool sectors[MAX_SECTORS] = {false};
    int sum = 0;
    printf("{\"offset_bytes\":[");
    for (int lane = 0; lane < LANES; ++lane) {
        if (lane) putchar(',');
        if (lane >= active) {
            printf("null");
            continue;
        }
        int index = first + lane * stride;
        const volatile float *address = source + index;
        size_t offset = (size_t)(address - source) * sizeof(*address);
        int sector = (int)(offset / SECTOR_BYTES);
        float value = *address;
        if (output) output[index] = value;
        sum += (int)value;
        sectors[sector] = true;
        printf("%zu", offset);
    }
    printf("],\"sectors\":[");
    int count = 0;
    for (int sector = 0; sector < MAX_SECTORS; ++sector) {
        if (!sectors[sector]) continue;
        if (count++) putchar(',');
        printf("%d", sector);
        if (all_sectors) all_sectors[sector] = true;
    }
    if (sector_count_sum) *sector_count_sum += count;
    printf("],\"load_sum\":%d}", sum);
}

static void traversal(const volatile float *source, bool by_column, float *output) {
    bool all_sectors[MAX_SECTORS] = {false};
    int total_sectors = 0;
    printf("{\"groups\":[\n");
    for (int group = 0; group < LANES; ++group) {
        if (group) printf(",\n");
        int first = by_column ? group : group * LANES;
        int stride = by_column ? LANES : 1;
        trace_group(source, first, stride, LANES, output, all_sectors, &total_sectors);
    }
    int union_count = 0;
    for (int sector = 0; sector < MAX_SECTORS; ++sector) {
        if (all_sectors[sector]) ++union_count;
    }
    printf("\n],\"per_group_sector_sum\":%d,\"sector_union_count\":%d}", total_sectors, union_count);
}

int main(void) {
    _Alignas(SECTOR_BYTES) float source[BUFFER_ELEMENTS];
    float rows[TILE_ELEMENTS], columns[TILE_ELEMENTS];
    for (int index = 0; index < BUFFER_ELEMENTS; ++index) {
        source[index] = (float)((index * 7 + 3) % 1021);
    }
    size_t base_mod_sector = (uintptr_t)source % SECTOR_BYTES;
    if (base_mod_sector != 0) return EXIT_FAILURE;

    printf("{\"base_mod_sector\":%zu,\"examples\":{\"aligned\":", base_mod_sector);
    trace_group(source, 0, 1, 32, NULL, NULL, NULL);
    printf(",\"offset_by_one\":");
    trace_group(source, 1, 1, 32, NULL, NULL, NULL);
    printf(",\"column\":");
    trace_group(source, 0, LANES, 32, NULL, NULL, NULL);
    printf(",\"seven_lanes\":");
    trace_group(source, 0, 1, 7, NULL, NULL, NULL);

    printf("},\"traversals\":{\"rows\":");
    traversal(source, false, rows);
    printf(",\"columns\":");
    traversal(source, true, columns);

    int sum = 0;
    for (int index = 0; index < TILE_ELEMENTS; ++index) {
        if (rows[index] != source[index] || columns[index] != source[index]) {
            fprintf(stderr, "copy mismatch at index %d\n", index);
            return EXIT_FAILURE;
        }
        sum += (int)rows[index];
    }
    printf("},\"copied_elements\":%d,\"copy_sum\":%d}\n", TILE_ELEMENTS, sum);
    return EXIT_SUCCESS;
}
