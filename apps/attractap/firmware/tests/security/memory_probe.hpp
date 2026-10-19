#pragma once
#include <cstddef>
void install_reader_memory_probe();
void report_reader_memory_probe();
void *reader_io_allocate(size_t);
void reader_io_free(void *);
